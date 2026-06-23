import { ethers } from 'hardhat'

/**
 * Deploys a SimpleAccountFactory bound to an EXISTING EntryPoint.
 * The factory's constructor deploys the SimpleAccount implementation (which now
 * implements ERC-1271), so new accounts created via this factory support
 * isValidSignature.
 *
 * Required env:
 *   AA_ENTRY_POINT_ADDRESS  — address of the already-deployed EntryPoint
 *   DEPLOYER_PRIVATE_KEY    — deployer key (configured on the target network)
 *
 * Run:
 *   yarn hardhat run scripts/deploy-simple-account-factory.ts --network lifeaitest
 */
async function main (): Promise<void> {
  const entryPoint = process.env.AA_ENTRY_POINT_ADDRESS
  if (entryPoint == null || !ethers.utils.isAddress(entryPoint)) {
    throw new Error('Set AA_ENTRY_POINT_ADDRESS to a valid EntryPoint address')
  }

  const [deployer] = await ethers.getSigners()
  const net = await ethers.provider.getNetwork()
  console.log('deployer   :', deployer.address)
  console.log('chainId    :', net.chainId)
  console.log('entryPoint :', entryPoint)

  const Factory = await ethers.getContractFactory('SimpleAccountFactory')
  const factory = await Factory.deploy(entryPoint)
  await factory.deployed()

  const implementation = await factory.accountImplementation()
  console.log('SimpleAccountFactory     :', factory.address)
  console.log('SimpleAccount (impl)     :', implementation)
  console.log('\nUpdate AA_SMART_ACCOUNT_FACTORY_ADDRESS to:', factory.address)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
