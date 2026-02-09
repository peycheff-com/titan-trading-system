use crate::model::DexFillProof;
use ed25519_dalek::Verifier;

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

        // Verify signature against program_id and tx_hash
        // This expects the signature to be over the concatenation of program_id and tx_hash
        // In a real implementation, you'd header/payload decode the specific chain transaction format.

        let public_key_bytes = match hex::decode(&proof.program_id) {
            Ok(bytes) => {
                if bytes.len() != 32 {
                    return Err(
                        "Invalid program_id length (expected 32 bytes for Ed25519)".to_string()
                    );
                }
                bytes
            }
            Err(_) => return Err("Invalid program_id hex".to_string()),
        };

        let signature_bytes = match hex::decode(&proof.sig) {
            Ok(bytes) => {
                if bytes.len() != 64 {
                    return Err(
                        "Invalid signature length (expected 64 bytes for Ed25519)".to_string()
                    );
                }
                bytes
            }
            Err(_) => return Err("Invalid signature hex".to_string()),
        };

        let verifier =
            match ed25519_dalek::VerifyingKey::from_bytes(&public_key_bytes.try_into().unwrap()) {
                Ok(vk) => vk,
                Err(_) => return Err("Invalid public key".to_string()),
            };

        let signature = ed25519_dalek::Signature::from_bytes(&signature_bytes.try_into().unwrap());

        // Message is tx_hash bytes
        let message = match hex::decode(&proof.tx_hash) {
            Ok(bytes) => bytes,
            Err(_) => return Err("Invalid tx_hash hex".to_string()),
        };

        if let Err(_) = verifier.verify(&message, &signature) {
            return Err("Signature verification failed".to_string());
        }

        Ok(true)
    }
}

impl Default for DexValidator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::DexFillProof;
    use rust_decimal_macros::dec;

    #[test]
    fn test_dex_validator_basic() {
        use ed25519_dalek::{Signer, SigningKey};
        use rand::rngs::OsRng;

        let validator = DexValidator::new();

        let mut csprng = OsRng;
        let signing_key: SigningKey = SigningKey::generate(&mut csprng);
        let public_key = signing_key.verifying_key();

        let program_id_hex = hex::encode(public_key.to_bytes());
        let tx_hash_bytes = [0u8; 32]; // Dummies
        let tx_hash_hex = hex::encode(tx_hash_bytes);

        // Sign the tx_hash
        let signature = signing_key.sign(&tx_hash_bytes);
        let signature_hex = hex::encode(signature.to_bytes());

        let valid_proof = DexFillProof {
            sig: signature_hex,
            block_height: 100,
            tx_hash: tx_hash_hex,
            gas_used: dec!(50000),
            program_id: program_id_hex,
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

    #[test]
    fn test_dex_validator_invalid_signature() {
        use ed25519_dalek::{Signer, SigningKey};
        use rand::rngs::OsRng;

        let validator = DexValidator::new();

        let mut csprng = OsRng;
        let signing_key: SigningKey = SigningKey::generate(&mut csprng);
        let public_key = signing_key.verifying_key();

        let program_id_hex = hex::encode(public_key.to_bytes());
        let tx_hash_bytes = [0u8; 32];
        let tx_hash_hex = hex::encode(tx_hash_bytes);

        // INVALID Signature (signing wrong message)
        let signature = signing_key.sign(b"wrong message");
        let signature_hex = hex::encode(signature.to_bytes());

        let invalid_sig_proof = DexFillProof {
            sig: signature_hex,
            block_height: 100,
            tx_hash: tx_hash_hex,
            gas_used: dec!(50000),
            program_id: program_id_hex,
        };

        assert!(validator.validate(&invalid_sig_proof).is_err());
    }
}
