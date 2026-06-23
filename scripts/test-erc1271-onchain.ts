import { ethers } from 'hardhat'
import { Wallet } from 'ethers'

/**
 * On-chain smoke test for ERC-1271 on a deployed SimpleAccountFactory.
 * Creates (or reuses) an account, then checks isValidSignature for a valid and
 * an invalid owner signature against the live chain.
 *
 * Required env:
 *   AA_SMART_ACCOUNT_FACTORY_ADDRESS — the newly deployed factory
 *   DEPLOYER_PRIVATE_KEY             — funded key; also used as the account owner
 * Optional:
 *   ACCOUNT_SALT                     — salt for createAccount (default 0)
 *
 * Run:
 *   yarn hardhat run scripts/test-erc1271-onchain.ts --network lifeaitest
 */
const ERC1271_MAGIC = '0x1626ba7e'
const ERC1271_INVALID = '0xffffffff'

// Sign the raw 32-byte digest (no personal-sign prefix) — matches on-chain
// SignatureChecker / ECDSA.recover and EIP-712 typed-data signing.
function signDigest (signer: Wallet, hash: string): string {
  return ethers.utils.joinSignature(signer._signingKey().signDigest(hash))
}

async function main (): Promise<void> {
  const factoryAddr = process.env.AA_SMART_ACCOUNT_FACTORY_ADDRESS
  if (factoryAddr == null || !ethers.utils.isAddress(factoryAddr)) {
    throw new Error('Set AA_SMART_ACCOUNT_FACTORY_ADDRESS to the deployed factory')
  }
  const salt = process.env.ACCOUNT_SALT ?? '0'

  const [deployer] = await ethers.getSigners()
  const ownerKey = process.env.DEPLOYER_PRIVATE_KEY!
  const owner = new ethers.Wallet(ownerKey)
  console.log('factory :', factoryAddr)
  console.log('owner   :', owner.address)

  const factory = await ethers.getContractAt('SimpleAccountFactory', factoryAddr)

  // Counterfactual address, then deploy if needed.
  const accountAddr: string = await factory.getAddress(owner.address, salt)
  console.log('account :', accountAddr)
  if (await ethers.provider.getCode(accountAddr) === '0x') {
    console.log('deploying account via createAccount...')
    const tx = await factory.connect(deployer).createAccount(owner.address, salt)
    await tx.wait()
    console.log('  created in tx', tx.hash)
  } else {
    console.log('account already deployed, reusing')
  }

  const account = await ethers.getContractAt('SimpleAccount', accountAddr)

  // 1) valid owner signature → magic value
  const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('life-unity erc1271 test'))
  const goodSig = signDigest(owner, hash)
  const r1: string = await account.isValidSignature(hash, goodSig)
  console.log('valid owner sig  ->', r1, r1 === ERC1271_MAGIC ? 'OK (magic)' : 'FAIL')

  // 2) stranger signature → invalid
  const stranger = ethers.Wallet.createRandom()
  const badSig = signDigest(stranger, hash)
  const r2: string = await account.isValidSignature(hash, badSig)
  console.log('stranger sig     ->', r2, r2 === ERC1271_INVALID ? 'OK (rejected)' : 'FAIL')

  if (r1 !== ERC1271_MAGIC || r2 !== ERC1271_INVALID) {
    throw new Error('ERC-1271 on-chain check FAILED')
  }
  console.log('\nERC-1271 on-chain check PASSED ✅')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
