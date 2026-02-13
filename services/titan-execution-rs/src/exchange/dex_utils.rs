use ethers::prelude::*;
use rust_decimal::prelude::*;
use std::sync::Arc;

/// Shared EVM DEX utilities — slippage, token approval, gas estimation
///
/// Every DEX adapter must call `ensure_approval()` before swapping tokens,
/// and use `calc_min_output()` for slippage protection.

// Standard ERC-20 ABI — approve + allowance
abigen!(
    IERC20,
    r#"[
        {
          "inputs": [
            { "internalType": "address", "name": "spender", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
          ],
          "name": "approve",
          "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            { "internalType": "address", "name": "owner", "type": "address" },
            { "internalType": "address", "name": "spender", "type": "address" }
          ],
          "name": "allowance",
          "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            { "internalType": "address", "name": "account", "type": "address" }
          ],
          "name": "balanceOf",
          "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
          "stateMutability": "view",
          "type": "function"
        }
    ]"#
);

/// Default slippage tolerance in basis points (50 bps = 0.5%)
pub const DEFAULT_SLIPPAGE_BPS: u64 = 50;

/// Maximum approval amount (type(uint256).max)
pub const MAX_APPROVAL: U256 = U256::MAX;

/// Calculate minimum output amount with slippage protection.
///
/// Given a `quoted_amount` and `slippage_bps`, returns the minimum
/// acceptable output: `quoted_amount * (10000 - slippage_bps) / 10000`.
///
/// For input-side use (where we don't have a quote), applies slippage
/// to the input amount as a rough protection floor.
pub fn calc_min_output(amount_in: U256, slippage_bps: u64) -> U256 {
    // min_out = amount_in * (10000 - slippage_bps) / 10000
    let factor = U256::from(10000u64 - slippage_bps);
    amount_in * factor / U256::from(10000u64)
}

/// Ensure the router has sufficient ERC-20 token allowance.
///
/// If current allowance < required amount, sends an `approve(MAX)` transaction.
/// This follows the standard "approve once, swap many" pattern used by
/// all production DEX frontends.
///
/// Returns Ok(true) if approval was sent, Ok(false) if already approved.
pub async fn ensure_approval<M: Middleware + 'static>(
    client: Arc<M>,
    token: Address,
    spender: Address,
    owner: Address,
    required: U256,
) -> Result<bool, String> {
    let erc20 = IERC20::new(token, client);

    // Check current allowance
    let current_allowance = erc20
        .allowance(owner, spender)
        .call()
        .await
        .map_err(|e| format!("Allowance check failed: {}", e))?;

    if current_allowance >= required {
        return Ok(false); // Already approved
    }

    // USDT-specific safety: If allowance > 0, we must reset to 0 first
    // Some tokens (like USDT on mainnet) revert if approving from non-zero to non-zero.
    if current_allowance > U256::zero() {
        let reset_tx = erc20.approve(spender, U256::zero());
        reset_tx
            .send()
            .await
            .map_err(|e| format!("Approval reset failed (USDT safety): {}", e))?
            .await
            .map_err(|e| format!("Approval reset confirmation failed: {}", e))?;
    }

    // Approve max
    let tx = erc20.approve(spender, MAX_APPROVAL);
    tx.send()
        .await
        .map_err(|e| format!("Approval transaction failed: {}", e))?;

    Ok(true) // Approval sent
}

/// Estimate EIP-1559 gas fees (max_fee + max_priority_fee).
/// Returns (max_fee_per_gas, max_priority_fee_per_gas)
pub async fn estimate_eip1559_fees<M: Middleware + 'static>(
    client: Arc<M>,
) -> Result<(U256, U256), String> {
    let (max_fee, priority_fee) = client
        .estimate_eip1559_fees(None)
        .await
        .map_err(|e| format!("EIP-1559 fee estimation failed: {}", e))?;
    
    // SOTA Safety: Add 10% buffer to max_fee to prevent "replacement fee too low" or stuck txs
    // during rapid volatility.
    let max_fee_buffered = max_fee * U256::from(110) / U256::from(100);
    
    Ok((max_fee_buffered, priority_fee))
}

/// Get ERC-20 token balance for an address.
pub async fn get_token_balance<M: Middleware + 'static>(
    client: Arc<M>,
    token: Address,
    owner: Address,
    decimals: u32,
) -> Result<Decimal, String> {
    let erc20 = IERC20::new(token, client);
    let balance = erc20
        .balance_of(owner)
        .call()
        .await
        .map_err(|e| format!("balanceOf failed: {}", e))?;

    let balance_str = balance.to_string();
    let raw = Decimal::from_str(&balance_str).unwrap_or(Decimal::ZERO);
    Ok(raw / Decimal::from(10u64.pow(decimals)))
}

/// Resolve well-known token decimals from address.
pub fn token_decimals_from_address(addr: &str) -> u32 {
    match addr.to_lowercase().as_str() {
        // USDC (Ethereum, BSC)
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" => 6,
        // USDT (Ethereum)
        "0xdac17f958d2ee523a2206206994597c13d831ec7" => 6,
        // USDT (BSC)
        "0x55d398326f99059ff775485246999027b3197955" => 18, // BSC USDT is 18 decimals
        // WBTC
        "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599" => 8,
        // Default: 18 (WETH, DAI, WBNB, CAKE, etc.)
        _ => 18,
    }
}

/// Resolve slippage from environment variable or use default.
/// Reads `{PREFIX}_SLIPPAGE_BPS` env var.
pub fn resolve_slippage(prefix: &str) -> u64 {
    std::env::var(format!("{}_SLIPPAGE_BPS", prefix))
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_SLIPPAGE_BPS)
}
