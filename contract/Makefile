-include .env

.PHONY: clean build test deployIdentity deployFactory uploadSEP57 initializeFactory deployCompliance initializeIdentity initializeCompliance initializeFactory

clean:
	cargo clean

build:
	stellar contract build

test:
	cargo llvm-cov nextest test --html --ignore-filename-regex "types.rs|external.rs|token.rs"  

deployIdentity:
	stellar contract deploy --network $(NETWORK) --source-account $(SOURCE_ACCOUNT) --wasm target/wasm32v1-none/release/identity_verifier.wasm --alias identity_verifier

deployCompliance:
	stellar contract deploy --network $(NETWORK) --source-account $(SOURCE_ACCOUNT) --wasm target/wasm32v1-none/release/compliance.wasm --alias compliance

deployFactory:
	stellar contract deploy --network $(NETWORK) --source-account $(SOURCE_ACCOUNT) --wasm target/wasm32v1-none/release/factory.wasm --alias factory

uploadSEP57:
	stellar contract upload --network $(NETWORK) --source-account $(SOURCE_ACCOUNT) --wasm target/wasm32v1-none/release/sep57.wasm

initializeIdentity:
	stellar contract invoke --network $(NETWORK) --source-account $(SOURCE_ACCOUNT) --id $(IDENTITY_ADDRESS) -- initialize --admin $(ADMIN_ADDRESS)

initializeCompliance:
	stellar contract invoke --network $(NETWORK) --source-account $(SOURCE_ACCOUNT) --id $(COMPLIANCE_ADDRESS) -- initialize --operator $(FACTORY_ADDRESS)

initializeFactory:
	stellar contract invoke --network $(NETWORK) --source-account $(SOURCE_ACCOUNT) --id $(FACTORY_ADDRESS) -- initialize --admin $(ADMIN_ADDRESS) --identity_verifier $(IDENTITY_ADDRESS) --compliance $(COMPLIANCE_ADDRESS) --usdc $(USDC_ADDRESS) --admin_signer $(ADMIN_SIGNER) --protocol_fee_bps $(FACTORY_PROTOCOL_FEE_BPS) --sep57_wasm_hash $(SEP57_WASM_HASH)