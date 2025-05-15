.PHONY: test deploy
test:
	npx hardhat test test/entrypoint.atomic.test.ts

deploy:
	npx hardhat deploy --network dev


