import './aa.init'
import { BigNumber, Event, Wallet } from 'ethers'
import { expect } from 'chai'
import {
  SimpleAccount,
  SimpleAccountFactory,
  TestAggregatedAccount__factory,
  TestAggregatedAccountFactory__factory,
  TestCounter,
  TestCounter__factory,
  TestExpirePaymaster,
  TestExpirePaymaster__factory,
  TestExpiryAccount,
  TestExpiryAccount__factory,
  TestPaymasterAcceptAll,
  TestPaymasterAcceptAll__factory,
  TestRevertAccount__factory,
  TestAggregatedAccount,
  TestSignatureAggregator,
  TestSignatureAggregator__factory,
  MaliciousAccount__factory,
  TestWarmColdAccount__factory,
  TestPaymasterRevertCustomError__factory,
  IEntryPoint__factory,
  SimpleAccountFactory__factory,
  IStakeManager__factory,
  INonceManager__factory,
  EntryPoint,
  TestPaymasterWithPostOp__factory,
  TestPaymasterWithPostOp
} from '../typechain'
import {
  AddressZero,
  createAccountOwner,
  fund,
  checkForGeth,
  rethrow,
  tostr,
  getAccountInitCode,
  calcGasUsage,
  ONE_ETH,
  TWO_ETH,
  deployEntryPoint,
  getBalance,
  createAddress,
  getAccountAddress,
  HashZero,
  createAccount,
  getAggregatedAccountInitCode,
  decodeRevertReason, parseValidationData, findUserOpWithMin
} from './testutils'
import { DefaultsForUserOp, fillAndSign, fillSignAndPack, getUserOpHash, packUserOp, simulateValidation } from './UserOp'
import { PackedUserOperation, UserOperation } from './UserOperation'
import { PopulatedTransaction } from 'ethers/lib/ethers'
import { ethers } from 'hardhat'
import { arrayify, defaultAbiCoder, hexZeroPad, parseEther } from 'ethers/lib/utils'
import { debugTransaction } from './debugTx'
import { BytesLike } from '@ethersproject/bytes'
import { toChecksumAddress } from 'ethereumjs-util'
import { getERC165InterfaceID } from '../src/Utils'
import { UserOperationEventEvent } from '../typechain/contracts/interfaces/IEntryPoint'

describe('EntryPoint', function () {
  let entryPoint: EntryPoint
  let simpleAccountFactory: SimpleAccountFactory

  let accountOwner: Wallet
  const ethersSigner = ethers.provider.getSigner()
  let account: SimpleAccount

  const globalUnstakeDelaySec = 2
  const paymasterStake = ethers.utils.parseEther('2')

  before(async function () {
    this.timeout(20000)
    await checkForGeth()

    const chainId = await ethers.provider.getNetwork().then(net => net.chainId)

    entryPoint = await deployEntryPoint()

    accountOwner = createAccountOwner();
    ({
      proxy: account,
      accountFactory: simpleAccountFactory
    } = await createAccount(ethersSigner, await accountOwner.getAddress(), entryPoint.address))
    await fund(account)

    // sanity: validate helper functions
    const sampleOp = await fillAndSign({ sender: account.address }, accountOwner, entryPoint)
    const packedOp = packUserOp(sampleOp)
    expect(getUserOpHash(sampleOp, entryPoint.address, chainId)).to.eql(await entryPoint.getUserOpHash(packedOp))
  })

  describe('with paymaster (account with no eth)', () => {
    let paymaster: TestPaymasterAcceptAll
    let counter: TestCounter
    let accountExecFromEntryPoint: PopulatedTransaction
    const account2Owner = createAccountOwner()

    before(async () => {
      paymaster = await new TestPaymasterAcceptAll__factory(ethersSigner).deploy(entryPoint.address)
      await paymaster.addStake(globalUnstakeDelaySec, { value: paymasterStake })
      counter = await new TestCounter__factory(ethersSigner).deploy()
      const count = await counter.populateTransaction.count()
      accountExecFromEntryPoint = await account.populateTransaction.execute(counter.address, 0, count.data!)
    })

  

    it('should execute two transfers atomically in one tx', async function () {
      await paymaster.deposit({ value: ONE_ETH })

      // Create two account owners
      const account1Owner = createAccountOwner()
      const account2Owner = createAccountOwner()

      // Create two accounts
      const account1 = await createAccount(ethersSigner, await account1Owner.getAddress(), entryPoint.address)
      const account2 = await createAccount(ethersSigner, await account2Owner.getAddress(), entryPoint.address)

      // Fund account1 for testing
      await ethersSigner.sendTransaction({
        to: account1.proxy.address,
        value: parseEther('2')
      })

      // GErt account 1 and account 2 balance 
      const account1Balance = await getBalance(account1.proxy.address)
      const account2Balance = await getBalance(account2.proxy.address)
      console.log('account1Balance', account1Balance)
      console.log('account2Balance', account2Balance)

      // Create two destinations for transfers
      const destination = createAddress()
      
      // Create transfer operations
      const transferOp1 = await fillSignAndPack({
        sender: account1.proxy.address,
        callData: account1.proxy.interface.encodeFunctionData('execute', [
          account2.proxy.address,
          parseEther('1'),
          '0x'
        ]),
        paymaster: paymaster.address,
        paymasterVerificationGasLimit: 1e6,
        callGasLimit: 2e6,
        verificationGasLimit: 2e6
      }, account1Owner, entryPoint)

      const transferOp2 = await fillSignAndPack({
        sender: account2.proxy.address,
        callData: account2.proxy.interface.encodeFunctionData('execute', [
          destination,
          parseEther('1.5'),
          '0x'
        ]),
        paymaster: paymaster.address,
        paymasterVerificationGasLimit: 1e6,
        callGasLimit: 2e6,
        verificationGasLimit: 2e6
      }, account2Owner, entryPoint)

      const beneficiaryAddress = createAddress()

      // Execute both transfers atomically
      const rcpt = await entryPoint.handleAtomicOps(
        [transferOp1, transferOp2],
        beneficiaryAddress
      ).then(async t => t.wait())


      // Verify both transfers succeeded
      const balance = await getBalance(destination)
      console.log('balance', balance)
    
      // get account 1 and account 2 balance
      const account1BalanceAfter = await getBalance(account1.proxy.address)
      const account2BalanceAfter = await getBalance(account2.proxy.address)
      console.log('account1BalanceAfter', account1BalanceAfter)
      console.log('account2BalanceAfter', account2BalanceAfter)
     
    })
  })
})
 