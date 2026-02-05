use crate::model::DexFillProof;

#[derive(Debug, Clone)]
pub struct DexValidator;

impl DexValidator {
    pub fn new() -> Self {
        Self
    }

    /// Validates a DEX fill proof.
    /// Returns true if the proof is structurally valid.
    /// In a real implementation, this would verify the cryptographic signature
    /// and check the transaction against the blockchain (via RPC).
    pub fn validate(&self, proof: &DexFillProof) -> Result<bool, String> {
        if proof.sig.is_empty() {
            return Err("Missing signature".to_string());
        }
        if proof.tx_hash.is_empty() {
            return Err("Missing tx hash".to_string());
        }
        if proof.program_id.is_empty() {
            return Err("Missing program ID".to_string());
        }
        if proof.block_height == 0 {
            return Err("Invalid block height".to_string());
        }

        // TODO: Verify signature against program_id and tx_hash
        // This would require key checks and potentially an RPC call using ethers/web3

        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::DexFillProof;
    use rust_decimal_macros::dec;

    #[test]
    fn test_dex_validator_basic() {
        let validator = DexValidator::new();
        let valid_proof = DexFillProof {
            sig: "0x123".to_string(),
            block_height: 100,
            tx_hash: "0xabc".to_string(),
            gas_used: dec!(50000),
            program_id: "program123".to_string(),
        };

        assert!(validator.validate(&valid_proof).unwrap());
    }

    #[test]
    fn test_dex_validator_missing_fields() {
        let validator = DexValidator::new();
        let invalid_proof = DexFillProof {
            sig: "".to_string(),
            block_height: 100,
            tx_hash: "0xabc".to_string(),
            gas_used: dec!(50000),
            program_id: "program123".to_string(),
        };

        assert!(validator.validate(&invalid_proof).is_err());
    }
}
