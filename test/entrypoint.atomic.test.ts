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


      it('paymaster should pay for tx', async function () {
        await paymaster.deposit({ value: ONE_ETH })
        const op = await fillSignAndPack({
          paymaster: paymaster.address,
          paymasterVerificationGasLimit: 1e6,
          callData: accountExecFromEntryPoint.data,
          initCode: getAccountInitCode(account2Owner.address, simpleAccountFactory)
        }, account2Owner, entryPoint)
        const beneficiaryAddress = createAddress()

        const rcpt = await entryPoint.handleAtomicOps([op], beneficiaryAddress).then(async t => t.wait())

        const { actualGasCost } = await calcGasUsage(rcpt, entryPoint, beneficiaryAddress)
        const paymasterPaid = ONE_ETH.sub(await entryPoint.balanceOf(paymaster.address))
        expect(paymasterPaid).to.eql(actualGasCost)
      })
      it('simulateValidation should return paymaster stake and delay', async () => {
        await paymaster.deposit({ value: ONE_ETH })
        const anOwner = createAccountOwner()

        const op = await fillSignAndPack({
          paymaster: paymaster.address,
          paymasterVerificationGasLimit: 1e6,
          callData: accountExecFromEntryPoint.data,
          initCode: getAccountInitCode(anOwner.address, simpleAccountFactory)
        }, anOwner, entryPoint)

        const { paymasterInfo } = await simulateValidation(op, entryPoint.address)
        const {
          stake: simRetStake,
          unstakeDelaySec: simRetDelay
        } = paymasterInfo

        expect(simRetStake).to.eql(paymasterStake)
        expect(simRetDelay).to.eql(globalUnstakeDelaySec)
      })
    })
     
})
 