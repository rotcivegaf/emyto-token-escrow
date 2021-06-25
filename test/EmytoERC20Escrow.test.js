const TestERC20 = artifacts.require('TestERC20');

const EmytoERC20Escrow = artifacts.require('EmytoERC20Escrow');

const {
  constants,
  expectEvent,
  expectRevert,
} = require('@openzeppelin/test-helpers');

const {
  bn,
  expect,
  maxUint,
  randombnBetween,
  random32,
  random32bn,
} = require('./helpers.js');

contract('EmytoERC20Escrow', (accounts) => {
  const WEI = bn(web3.utils.toWei('1'));
  let BASE;

  const owner = accounts[1];
  const creator = accounts[2];
  const agent = accounts[5];
  const depositant = accounts[3];
  const retreader = accounts[4];

  let erc20Escrow;
  let erc20;

  let salt = 0;
  let basicEscrow;

  const balances = {};

  async function saveBalances (escrowId) {
    balances.owner = await erc20.balanceOf(owner);
    balances.creator = await erc20.balanceOf(creator);
    balances.agent = await erc20.balanceOf(agent);
    balances.depositant = await erc20.balanceOf(depositant);
    balances.retreader = await erc20.balanceOf(retreader);

    balances.erc20Escrow = {};
    balances.erc20Escrow.contract = await erc20.balanceOf(erc20Escrow.address);
    balances.erc20Escrow.escrow = (await erc20Escrow.escrows(escrowId)).balance;
    balances.erc20Escrow.emyto = await erc20Escrow.emytoBalances(erc20.address);
  }

  async function setApproveBalance (beneficiary, amount) {
    await erc20.setBalance(beneficiary, amount, { from: owner });
    await erc20.approve(erc20Escrow.address, amount, { from: beneficiary });
  }

  async function calcId (agent, depositant, retreader, fee, token, salt) {
    const id = await erc20Escrow.calculateId(
      agent,
      depositant,
      retreader,
      fee,
      token,
      salt,
    );

    const localId = web3.utils.soliditySha3(
      { t: 'address', v: erc20Escrow.address },
      { t: 'address', v: agent },
      { t: 'address', v: depositant },
      { t: 'address', v: retreader },
      { t: 'uint16', v: fee },
      { t: 'address', v: token },
      { t: 'uint256', v: salt },
    );

    assert.equal(id, localId);

    return id;
  }

  async function createBasicEscrow () {
    basicEscrow.salt = ++salt;

    await erc20Escrow.createEscrow(
      basicEscrow.depositant,
      basicEscrow.retreader,
      basicEscrow.fee,
      basicEscrow.token,
      basicEscrow.salt,
      { from: basicEscrow.agent },
    );

    return calcId(basicEscrow.agent, basicEscrow.depositant, basicEscrow.retreader, basicEscrow.fee, basicEscrow.token, basicEscrow.salt);
  }

  async function deposit (escrowId, amount = WEI) {
    const escrow = await erc20Escrow.escrows(escrowId);
    await setApproveBalance(escrow.depositant, amount);

    await erc20Escrow.deposit(escrowId, amount, { from: escrow.depositant });
  }

  before('Deploy contracts', async function () {
    erc20Escrow = await EmytoERC20Escrow.new({ from: owner });
    await erc20Escrow.setEmytoFee(50, { from: owner });

    erc20 = await TestERC20.new({ from: owner });

    BASE = await erc20Escrow.BASE();

    basicEscrow = {
      agent: agent,
      depositant: depositant,
      retreader: retreader,
      fee: bn(500),
      token: erc20.address,
      salt: salt,
    };
  });

  describe('Functions onlyOwner', async function () {
    it('Try set emyto fee without being the owner', async function () {
      await expectRevert(
        erc20Escrow.setEmytoFee(0, { from: creator }),
        'Ownable: caller is not the owner',
      );
    });
    it('Try withdraw token amount without be the owner', async function () {
      await expectRevert(
        erc20Escrow.emytoWithdraw(constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, 0, { from: creator }),
        'Ownable: caller is not the owner',
      );
    });
  });
  describe('Overflows', async function () {
    it('Try withdraw a high amount', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);

      await expectRevert(
        erc20Escrow.emytoWithdraw(erc20.address, creator, constants.MAX_UINT256, { from: owner }),
        'revert',
      );
    });
  });
  describe('Try execute functions with non-exists escrow', function () {
    it('Try deposit in non-exists escrow', async () => {
      await expectRevert(
        erc20Escrow.deposit(random32(), 0, { from: agent }),
        'EmytoERC20Escrow::deposit: The sender should be the depositant',
      );
    });
    it('Try withdraw to retreader of non-exists escrow', async () => {
      await expectRevert(
        erc20Escrow.withdrawToRetreader(random32(), 0, { from: agent }),
        'EmytoERC20Escrow::_withdraw: The sender should be the _approved or the agent',
      );
    });
    it('Try withdraw to depositant of non-exists escrow', async () => {
      await expectRevert(
        erc20Escrow.withdrawToDepositant(random32(), 0, { from: agent }),
        'EmytoERC20Escrow::_withdraw: The sender should be the _approved or the agent',
      );
    });
    it('Try cancel an non-exists escrow', async () => {
      await expectRevert(
        erc20Escrow.cancel(random32(), { from: agent }),
        'EmytoERC20Escrow::cancel: The sender should be the agent',
      );
    });
  });
  describe('Function setEmytoFee', function () {
    it('set 0% emyto fee', async () => {
      const _erc20Escrow = await EmytoERC20Escrow.new({ from: owner });
      await _erc20Escrow.setEmytoFee(50, { from: owner });

      const fee = bn(0);

      expectEvent(
        await _erc20Escrow.setEmytoFee(fee, { from: owner }),
        'SetEmytoFee',
        { fee: fee },
      );

      expect(await _erc20Escrow.emytoFee()).to.eq.BN(fee);
    });
    it('set 0.5% emyto fee', async () => {
      const _erc20Escrow = await EmytoERC20Escrow.new({ from: owner });

      const fee = bn(50);

      expectEvent(
        await _erc20Escrow.setEmytoFee(fee, { from: owner }),
        'SetEmytoFee',
        { fee: fee },
      );

      expect(await _erc20Escrow.emytoFee()).to.eq.BN(fee);
    });
    it('Try set a high emyto fee(>0.5%)', async function () {
      await expectRevert(
        erc20Escrow.setEmytoFee(51, { from: owner }),
        'EmytoERC20Escrow::setEmytoFee: The emyto fee should be low or equal than the MAX_EMYTO_FEE',
      );

      await expectRevert(
        erc20Escrow.setEmytoFee(constants.MAX_UINT256, { from: owner }),
        'EmytoERC20Escrow::setEmytoFee: The emyto fee should be low or equal than the MAX_EMYTO_FEE',
      );
    });
  });
  describe('Function emytoWithdraw', function () {
    it('Withdraw all balance from emyto', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);

      const emytoFee = await erc20Escrow.emytoFee();
      const toEmyto = WEI.mul(emytoFee).div(BASE);

      await saveBalances(escrowId);

      expectEvent(
        await erc20Escrow.emytoWithdraw(erc20.address, creator, toEmyto, { from: owner }),
        'EmytoWithdraw',
        { token: erc20.address, to: creator, amount: toEmyto },
      );

      expect(await erc20Escrow.emytoBalances(erc20.address)).to.eq.BN(balances.erc20Escrow.emyto.sub(toEmyto));

      expect(await erc20.balanceOf(owner)).to.eq.BN(balances.owner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(balances.creator.add(toEmyto));
      expect(await erc20.balanceOf(agent)).to.eq.BN(balances.agent);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(balances.depositant);
      expect(await erc20.balanceOf(retreader)).to.eq.BN(balances.retreader);

      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(balances.erc20Escrow.contract.sub(toEmyto));
    });
    it('Try withdraw to address 0', async function () {
      await expectRevert(
        erc20Escrow.emytoWithdraw(erc20.address, constants.ZERO_ADDRESS, 0, { from: owner }),
        'EmytoERC20Escrow::emytoWithdraw: The to address 0 its invalid',
      );
    });
  });
  describe('Function createEscrow', function () {
    it('Create basic escrow', async () => {
      const salt = random32bn();
      const id = await calcId(agent, depositant, retreader, 0, erc20.address, salt);

      expectEvent(
        await erc20Escrow.createEscrow(depositant, retreader, 0, erc20.address, salt, { from: agent }),
        'CreateEscrow',
        { escrowId: id, agent: agent, depositant: depositant, retreader: retreader, fee: bn(0), token: erc20.address, salt: salt },
      );

      const escrow = await erc20Escrow.escrows(id);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      expect(escrow.fee).to.eq.BN(0);
      assert.equal(escrow.token, erc20.address);
      expect(escrow.balance).to.eq.BN(0);
    });
    it('Create basic escrow with agent fee', async () => {
      const salt = random32bn();
      const agentFee = randombnBetween(1, 1000);
      const id = await calcId(agent, depositant, retreader, agentFee, erc20.address, salt);

      expectEvent(
        await erc20Escrow.createEscrow(depositant, retreader, agentFee, erc20.address, salt, { from: agent }),
        'CreateEscrow',
        { escrowId: id, agent: agent, depositant: depositant, retreader: retreader, fee: agentFee, token: erc20.address, salt: salt },
      );

      const escrow = await erc20Escrow.escrows(id);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      expect(escrow.fee).to.eq.BN(agentFee);
      assert.equal(escrow.token, erc20.address);
      expect(escrow.balance).to.eq.BN(0);
    });
    it('Try create two escrows with the same id', async function () {
      const escrowId = await createBasicEscrow();

      await expectRevert(
        erc20Escrow.createEscrow(
          basicEscrow.depositant,
          basicEscrow.retreader,
          basicEscrow.fee,
          basicEscrow.token,
          basicEscrow.salt,
          { from: basicEscrow.agent },
        ),
        'EmytoERC20Escrow::createEscrow: The escrow exists',
      );

      // With signature
      const agentSignature = await web3.eth.sign(escrowId, basicEscrow.agent);
      await expectRevert(
        erc20Escrow.signedCreateEscrow(
          basicEscrow.agent,
          basicEscrow.depositant,
          basicEscrow.retreader,
          basicEscrow.fee,
          basicEscrow.token,
          basicEscrow.salt,
          agentSignature,
          { from: basicEscrow.agent },
        ),
        'EmytoERC20Escrow::createEscrow: The escrow exists',
      );
    });
    it('Try set a high agent fee(>10%)', async function () {
      await expectRevert(
        erc20Escrow.createEscrow(
          depositant,
          retreader,
          1001,
          erc20.address,
          random32bn(),
          { from: creator },
        ),
        'EmytoERC20Escrow::createEscrow: The agent fee should be low or equal than 1000',
      );

      await expectRevert(
        erc20Escrow.createEscrow(
          depositant,
          retreader,
          maxUint(16),
          erc20.address,
          random32bn(),
          { from: creator },
        ),
        'EmytoERC20Escrow::createEscrow: The agent fee should be low or equal than 1000',
      );

      await expectRevert(
        erc20Escrow.createEscrow(
          depositant,
          retreader,
          constants.MAX_UINT256,
          erc20.address,
          random32bn(),
          { from: creator },
        ),
        'value out-of-bounds',
      );
    });
  });
  describe('Function signedCreateEscrow', function () {
    it('Create a signed basic escrow', async () => {
      const salt = random32bn();
      const id = await calcId(agent, depositant, retreader, 0, erc20.address, salt);

      const agentSignature = await web3.eth.sign(id, agent);

      expectEvent(
        await erc20Escrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          0,
          erc20.address,
          salt,
          agentSignature,
          { from: creator },
        ),
        'SignedCreateEscrow',
        { escrowId: id, agentSignature: agentSignature },
      );

      const escrow = await erc20Escrow.escrows(id);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      expect(escrow.fee).to.eq.BN(0);
      assert.equal(escrow.token, erc20.address);
      expect(escrow.balance).to.eq.BN(0);
    });
    it('Try create two escrows with the same id', async function () {
      const salt = random32bn();
      const id = await calcId(agent, depositant, retreader, 0, erc20.address, salt);

      const agentSignature = await web3.eth.sign(id, agent);

      await erc20Escrow.signedCreateEscrow(
        agent,
        depositant,
        retreader,
        0,
        erc20.address,
        salt,
        agentSignature,
        { from: agent },
      );

      await expectRevert(
        erc20Escrow.createEscrow(
          depositant,
          retreader,
          0,
          erc20.address,
          salt,
          { from: agent },
        ),
        'EmytoERC20Escrow::createEscrow: The escrow exists',
      );

      await expectRevert(
        erc20Escrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          0,
          erc20.address,
          salt,
          agentSignature,
          { from: agent },
        ),
        'EmytoERC20Escrow::createEscrow: The escrow exists',
      );
    });
    it('Try create a signed basic escrow with invalid signature', async () => {
      const salt = random32bn();

      // With wrong id
      const wrongSignature = await web3.eth.sign([], agent);
      await expectRevert(
        erc20Escrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          0,
          erc20.address,
          salt,
          wrongSignature,
          { from: creator },
        ),
        'EmytoERC20Escrow::signedCreateEscrow: Invalid agent signature',
      );

      // With wrong agent in calcId
      const id = await calcId(creator, depositant, retreader, 0, erc20.address, salt);
      const wrongSignature2 = await web3.eth.sign(id, agent);

      await expectRevert(
        erc20Escrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          0,
          erc20.address,
          salt,
          wrongSignature2,
          { from: creator },
        ),
        'EmytoERC20Escrow::signedCreateEscrow: Invalid agent signature',
      );

      // With wrong signer
      const wrongSignature3 = await web3.eth.sign(id, creator);

      await expectRevert(
        erc20Escrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          0,
          erc20.address,
          salt,
          wrongSignature3,
          { from: creator },
        ),
        'EmytoERC20Escrow::signedCreateEscrow: Invalid agent signature',
      );
    });
    it('Try create a signed basic escrow with canceled signature', async () => {
      const id = await calcId(agent, depositant, retreader, 0, erc20.address, salt);
      const canceledSignature = await web3.eth.sign(id, agent);

      await erc20Escrow.cancelSignature(canceledSignature, { from: agent });

      await expectRevert(
        erc20Escrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          0,
          erc20.address,
          salt,
          canceledSignature,
          { from: creator },
        ),
        'EmytoERC20Escrow::signedCreateEscrow: The signature was canceled',
      );
    });
  });
  describe('Function cancelSignature', function () {
    it('cancel a signature', async () => {
      const salt = random32bn();
      const id = await calcId(agent, depositant, retreader, 0, erc20.address, salt);

      const agentSignature = await web3.eth.sign(id, agent);

      assert.isFalse(await erc20Escrow.canceledSignatures(agent, agentSignature));

      expectEvent(
        await erc20Escrow.cancelSignature(agentSignature, { from: agent }),
        'CancelSignature',
        { agentSignature: agentSignature },
      );

      assert.isTrue(await erc20Escrow.canceledSignatures(agent, agentSignature));
    });
  });
  describe('Function deposit', function () {
    it('Deposit erc20 in an escrow', async () => {
      const escrowId = await createBasicEscrow();
      const amount = WEI;

      await setApproveBalance(depositant, amount);
      await saveBalances(escrowId);

      const emytoFee = await erc20Escrow.emytoFee();
      const toEmyto = amount.mul(emytoFee).div(BASE);
      const toEscrow = amount.sub(toEmyto);

      expectEvent(
        await erc20Escrow.deposit(escrowId, amount, { from: depositant }),
        'Deposit',
        { escrowId: escrowId, toEscrow: toEscrow, toEmyto: toEmyto },
      );

      const escrow = await erc20Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      expect(escrow.fee).to.eq.BN(basicEscrow.fee);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20Escrow.emytoBalances(erc20.address)).to.eq.BN(balances.erc20Escrow.emyto.add(toEmyto));

      expect(await erc20.balanceOf(owner)).to.eq.BN(balances.owner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(balances.creator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(balances.agent);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(balances.depositant.sub(amount));
      expect(await erc20.balanceOf(retreader)).to.eq.BN(balances.retreader);

      expect(escrow.balance).to.eq.BN(balances.erc20Escrow.escrow.add(toEscrow));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(balances.erc20Escrow.contract.add(amount));
    });
    it('Deposit 0 amount in an escrow', async () => {
      const escrowId = await createBasicEscrow();
      const amount = bn(0);

      await setApproveBalance(depositant, amount);
      await saveBalances(escrowId);

      const emytoFee = await erc20Escrow.emytoFee();
      const toEmyto = amount.mul(emytoFee).div(BASE);
      const toEscrow = amount.sub(toEmyto);

      expectEvent(
        await erc20Escrow.deposit(escrowId, amount, { from: depositant }),
        'Deposit',
        { escrowId: escrowId, toEscrow: toEscrow, toEmyto: toEmyto },
      );

      const escrow = await erc20Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      expect(escrow.fee).to.eq.BN(basicEscrow.fee);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20Escrow.emytoBalances(erc20.address)).to.eq.BN(balances.erc20Escrow.emyto);

      expect(await erc20.balanceOf(owner)).to.eq.BN(balances.owner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(balances.creator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(balances.agent);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(balances.depositant);
      expect(await erc20.balanceOf(retreader)).to.eq.BN(balances.retreader);

      expect(escrow.balance).to.eq.BN(balances.erc20Escrow.escrow.add(toEscrow));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(balances.erc20Escrow.contract);
    });
    it('Deposit high amount in an escrow', async () => {
      const escrowId = await createBasicEscrow();
      const amount = maxUint(240);

      await setApproveBalance(depositant, amount);
      await saveBalances(escrowId);

      const emytoFee = await erc20Escrow.emytoFee();
      const toEmyto = amount.mul(emytoFee).div(BASE);
      const toEscrow = amount.sub(toEmyto);

      expectEvent(
        await erc20Escrow.deposit(escrowId, amount, { from: depositant }),
        'Deposit',
        { escrowId: escrowId, toEscrow: toEscrow, toEmyto: toEmyto },
      );

      const escrow = await erc20Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      expect(escrow.fee).to.eq.BN(basicEscrow.fee);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20Escrow.emytoBalances(erc20.address)).to.eq.BN(balances.erc20Escrow.emyto.add(toEmyto));

      expect(await erc20.balanceOf(owner)).to.eq.BN(balances.owner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(balances.creator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(balances.agent);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(balances.depositant.sub(amount));
      expect(await erc20.balanceOf(retreader)).to.eq.BN(balances.retreader);

      expect(escrow.balance).to.eq.BN(balances.erc20Escrow.escrow.add(toEscrow));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(balances.erc20Escrow.contract.add(amount));
    });
    it('Try deposit in an escrow without be the depositant', async () => {
      const escrowId = await createBasicEscrow();

      await expectRevert(
        erc20Escrow.deposit(escrowId, 0, { from: creator }),
        'EmytoERC20Escrow::deposit: The sender should be the depositant',
      );
    });
  });
  describe('Function withdrawToRetreader', function () {
    it('Withdraw to retreader an escrow from depositant', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);
      const amount = WEI.div(bn(2));

      await saveBalances(escrowId);

      const toAgent = amount.mul(basicEscrow.fee).div(BASE);
      const toAmount = amount.sub(toAgent);

      expectEvent(
        await erc20Escrow.withdrawToRetreader(escrowId, amount, { from: depositant }),
        'Withdraw',
        { escrowId: escrowId, to: retreader, toAmount: toAmount, toAgent: toAgent },
      );

      const escrow = await erc20Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      expect(escrow.fee).to.eq.BN(basicEscrow.fee);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20Escrow.emytoBalances(erc20.address)).to.eq.BN(balances.erc20Escrow.emyto);

      expect(await erc20.balanceOf(owner)).to.eq.BN(balances.owner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(balances.creator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(balances.agent.add(toAgent));
      expect(await erc20.balanceOf(depositant)).to.eq.BN(balances.depositant);
      expect(await erc20.balanceOf(retreader)).to.eq.BN(balances.retreader.add(toAmount));

      expect(escrow.balance).to.eq.BN(balances.erc20Escrow.escrow.sub(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(balances.erc20Escrow.contract.sub(amount));
    });
    it('Withdraw to retreader an escrow from agent', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);
      const amount = WEI.div(bn(2));

      await saveBalances(escrowId);

      const toAgent = amount.mul(basicEscrow.fee).div(BASE);
      const toAmount = amount.sub(toAgent);

      expectEvent(
        await erc20Escrow.withdrawToRetreader(escrowId, amount, { from: agent }),
        'Withdraw',
        { escrowId: escrowId, to: retreader, toAmount: toAmount, toAgent: toAgent },
      );

      const escrow = await erc20Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      expect(escrow.fee).to.eq.BN(basicEscrow.fee);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20Escrow.emytoBalances(erc20.address)).to.eq.BN(balances.erc20Escrow.emyto);

      expect(await erc20.balanceOf(owner)).to.eq.BN(balances.owner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(balances.creator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(balances.agent.add(toAgent));
      expect(await erc20.balanceOf(depositant)).to.eq.BN(balances.depositant);
      expect(await erc20.balanceOf(retreader)).to.eq.BN(balances.retreader.add(toAmount));

      expect(escrow.balance).to.eq.BN(balances.erc20Escrow.escrow.sub(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(balances.erc20Escrow.contract.sub(amount));
    });
    it('Withdraw to retreader 0 amount', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);
      const amount = bn(0);

      await saveBalances(escrowId);

      const toAgent = amount.mul(basicEscrow.fee).div(BASE);
      const toAmount = amount.sub(toAgent);

      expectEvent(
        await erc20Escrow.withdrawToRetreader(escrowId, amount, { from: depositant }),
        'Withdraw',
        { escrowId: escrowId, to: retreader, toAmount: toAmount, toAgent: toAgent },
      );

      const escrow = await erc20Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      expect(escrow.fee).to.eq.BN(basicEscrow.fee);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20Escrow.emytoBalances(erc20.address)).to.eq.BN(balances.erc20Escrow.emyto);

      expect(await erc20.balanceOf(owner)).to.eq.BN(balances.owner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(balances.creator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(balances.agent.add(toAgent));
      expect(await erc20.balanceOf(depositant)).to.eq.BN(balances.depositant);
      expect(await erc20.balanceOf(retreader)).to.eq.BN(balances.retreader);

      expect(escrow.balance).to.eq.BN(balances.erc20Escrow.escrow.sub(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(balances.erc20Escrow.contract);
    });
    it('Try withdraw to retreader without be the depositant or the agent', async () => {
      const escrowId = await createBasicEscrow();

      await expectRevert(
        erc20Escrow.withdrawToRetreader(escrowId, 0, { from: retreader }),
        'EmytoERC20Escrow::_withdraw: The sender should be the _approved or the agent',
      );

      await expectRevert(
        erc20Escrow.withdrawToRetreader(escrowId, 0, { from: creator }),
        'EmytoERC20Escrow::_withdraw: The sender should be the _approved or the agent',
      );
    });
  });
  describe('Function withdrawToDepositant', function () {
    it('Withdraw to depositant an escrow from retreader', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);
      const amount = WEI.div(bn(2));

      await saveBalances(escrowId);

      const toAgent = amount.mul(basicEscrow.fee).div(BASE);
      const toAmount = amount.sub(toAgent);

      expectEvent(
        await erc20Escrow.withdrawToDepositant(escrowId, amount, { from: retreader }),
        'Withdraw',
        { escrowId: escrowId, to: depositant, toAmount: toAmount, toAgent: toAgent },
      );

      const escrow = await erc20Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      expect(escrow.fee).to.eq.BN(basicEscrow.fee);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20Escrow.emytoBalances(erc20.address)).to.eq.BN(balances.erc20Escrow.emyto);

      expect(await erc20.balanceOf(owner)).to.eq.BN(balances.owner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(balances.creator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(balances.agent.add(toAgent));
      expect(await erc20.balanceOf(depositant)).to.eq.BN(balances.depositant.add(toAmount));
      expect(await erc20.balanceOf(retreader)).to.eq.BN(balances.retreader);

      expect(escrow.balance).to.eq.BN(balances.erc20Escrow.escrow.sub(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(balances.erc20Escrow.contract.sub(amount));
    });
    it('Withdraw to depositant an escrow from agent', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);
      const amount = WEI.div(bn(2));

      await saveBalances(escrowId);

      const toAgent = amount.mul(basicEscrow.fee).div(BASE);
      const toAmount = amount.sub(toAgent);

      expectEvent(
        await erc20Escrow.withdrawToDepositant(escrowId, amount, { from: agent }),
        'Withdraw',
        { escrowId: escrowId, to: depositant, toAmount: toAmount, toAgent: toAgent },
      );

      const escrow = await erc20Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      expect(escrow.fee).to.eq.BN(basicEscrow.fee);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20Escrow.emytoBalances(erc20.address)).to.eq.BN(balances.erc20Escrow.emyto);

      expect(await erc20.balanceOf(owner)).to.eq.BN(balances.owner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(balances.creator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(balances.agent.add(toAgent));
      expect(await erc20.balanceOf(depositant)).to.eq.BN(balances.depositant.add(toAmount));
      expect(await erc20.balanceOf(retreader)).to.eq.BN(balances.retreader);

      expect(escrow.balance).to.eq.BN(balances.erc20Escrow.escrow.sub(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(balances.erc20Escrow.contract.sub(amount));
    });
    it('Withdraw to depositant 0 amount', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);
      const amount = bn(0);

      await saveBalances(escrowId);

      const toAgent = amount.mul(basicEscrow.fee).div(BASE);
      const toAmount = amount.sub(toAgent);

      expectEvent(
        await erc20Escrow.withdrawToDepositant(escrowId, amount, { from: retreader }),
        'Withdraw',
        { escrowId: escrowId, to: depositant, toAmount: toAmount, toAgent: toAgent },
      );

      const escrow = await erc20Escrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      expect(escrow.fee).to.eq.BN(basicEscrow.fee);
      assert.equal(escrow.token, erc20.address);

      expect(await erc20Escrow.emytoBalances(erc20.address)).to.eq.BN(balances.erc20Escrow.emyto);

      expect(await erc20.balanceOf(owner)).to.eq.BN(balances.owner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(balances.creator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(balances.agent.add(toAgent));
      expect(await erc20.balanceOf(depositant)).to.eq.BN(balances.depositant);
      expect(await erc20.balanceOf(retreader)).to.eq.BN(balances.retreader);

      expect(escrow.balance).to.eq.BN(balances.erc20Escrow.escrow.sub(amount));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(balances.erc20Escrow.contract);
    });
    it('Try withdraw to depositant without be the retreader or the agent', async () => {
      const escrowId = await createBasicEscrow();

      await expectRevert(
        erc20Escrow.withdrawToDepositant(escrowId, 0, { from: depositant }),
        'EmytoERC20Escrow::_withdraw: The sender should be the _approved or the agent',
      );

      await expectRevert(
        erc20Escrow.withdrawToDepositant(escrowId, 0, { from: creator }),
        'EmytoERC20Escrow::_withdraw: The sender should be the _approved or the agent',
      );
    });
  });
  describe('Function cancel', function () {
    it('Cancel an escrow', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);

      await saveBalances(escrowId);

      expectEvent(
        await erc20Escrow.cancel(escrowId, { from: agent }),
        'Cancel',
        { escrowId: escrowId, amount: balances.erc20Escrow.escrow },
      );

      const escrow = await erc20Escrow.escrows(escrowId);
      assert.equal(escrow.agent, constants.ZERO_ADDRESS);
      assert.equal(escrow.depositant, constants.ZERO_ADDRESS);
      assert.equal(escrow.retreader, constants.ZERO_ADDRESS);
      expect(escrow.fee).to.eq.BN(0);
      assert.equal(escrow.token, constants.ZERO_ADDRESS);

      expect(await erc20Escrow.emytoBalances(erc20.address)).to.eq.BN(balances.erc20Escrow.emyto);

      expect(await erc20.balanceOf(owner)).to.eq.BN(balances.owner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(balances.creator);
      expect(await erc20.balanceOf(agent)).to.eq.BN(balances.agent);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(balances.depositant.add(balances.erc20Escrow.escrow));
      expect(await erc20.balanceOf(retreader)).to.eq.BN(balances.retreader);

      expect(escrow.balance).to.eq.BN(balances.erc20Escrow.escrow.sub(balances.erc20Escrow.escrow));
      expect(await erc20.balanceOf(erc20Escrow.address)).to.eq.BN(balances.erc20Escrow.contract.sub(balances.erc20Escrow.escrow));
    });
    it('Try cancel without be the agent', async () => {
      const escrowId = await createBasicEscrow();

      await expectRevert(
        erc20Escrow.cancel(escrowId, { from: depositant }),
        'EmytoERC20Escrow::cancel: The sender should be the agent',
      );
    });
  });
});
