const TestToken = artifacts.require('TestToken');

const EmytoTokenEscrow = artifacts.require('EmytoTokenEscrow');

const {
  bn,
  expect,
  toEvents,
  tryCatchRevert,
  address0x,
  maxUint,
  random32,
  random32bn,
} = require('./Helper.js');

contract('EmytoTokenEscrow', (accounts) => {
  const WEI = bn(web3.utils.toWei('1'));
  let BASE;

  const owner = accounts[1];
  const creator = accounts[2];
  const depositant = accounts[3];
  const retreader = accounts[4];
  const agent = accounts[5];

  let prevBalOwner = 0;
  let prevBalCreator = 0;
  let prevBalDepositant = 0;
  let prevBalRetreader = 0;
  let prevBalAgent = 0;
  let prevBalEscrow = 0;
  let prevBalTokenEscrow = 0;
  let prevOwnerBalance = 0;

  let tokenEscrow;
  let erc20;

  let salt = 0;
  let basicEscrow;

  async function setApproveBalance (beneficiary, amount) {
    await erc20.setBalance(beneficiary, amount, { from: owner });
    await erc20.approve(tokenEscrow.address, amount, { from: beneficiary });
  }

  async function saveBalances (escrowId) {
    prevBalOwner = await erc20.balanceOf(owner);
    prevBalCreator = await erc20.balanceOf(creator);
    prevBalDepositant = await erc20.balanceOf(depositant);
    prevBalRetreader = await erc20.balanceOf(retreader);
    prevBalAgent = await erc20.balanceOf(agent);

    const escrow = await tokenEscrow.escrows(escrowId);
    prevBalEscrow = escrow.balance;
    prevBalTokenEscrow = await erc20.balanceOf(tokenEscrow.address);
    prevOwnerBalance = await tokenEscrow.ownerBalances(erc20.address);
  }

  function calcId (depositant, retreader, agent, salt) {
    return web3.utils.soliditySha3(
      { t: 'address', v: tokenEscrow.address },
      { t: 'address', v: depositant },
      { t: 'address', v: retreader },
      { t: 'address', v: agent },
      { t: 'uint256', v: salt }
    );
  }

  async function createBasicEscrow () {
    basicEscrow.salt = ++salt;

    await tokenEscrow.createEscrow(
      basicEscrow.depositant,
      basicEscrow.retreader,
      basicEscrow.agent,
      basicEscrow.fee,
      basicEscrow.token,
      basicEscrow.salt,
      { from: basicEscrow.sender }
    );

    return calcId(basicEscrow.depositant, basicEscrow.retreader, basicEscrow.agent, basicEscrow.salt);
  }

  async function createBasicEscrowWithApprove () {
    const escrowId = await createBasicEscrow();

    await tokenEscrow.approveEscrow(escrowId, { from: basicEscrow.agent });

    return escrowId;
  }

  async function deposit (escrowId, amount = WEI) {
    const escrow = await tokenEscrow.escrows(escrowId);
    await setApproveBalance(escrow.depositant, amount);

    await tokenEscrow.deposit(escrowId, amount, { from: escrow.depositant });
  }

  before('Deploy contracts', async function () {
    tokenEscrow = await EmytoTokenEscrow.new({ from: owner });
    await tokenEscrow.setOwnerFee(500, { from: owner });

    erc20 = await TestToken.new({ from: owner });

    BASE = await tokenEscrow.BASE();

    basicEscrow = {
      depositant: depositant,
      retreader: retreader,
      agent: agent,
      fee: 500,
      token: erc20.address,
      salt: salt,
      sender: creator,
    };
  });

  describe('Functions onlyOwner', async function () {
    it('Try set owner fee without being the owner', async function () {
      await tryCatchRevert(
        () => tokenEscrow.setOwnerFee(
          0,
          { from: creator }
        ),
        'The owner should be the sender'
      );
    });
    it('Try withdraw token amount without be the owner', async function () {
      await tryCatchRevert(
        () => tokenEscrow.ownerWithdraw(
          address0x,
          address0x,
          0,
          { from: creator }
        ),
        'The owner should be the sender'
      );
    });
  });
  describe('Function setOwnerFee', function () {
    it('set 10% owner fee', async () => {
      const tenPorcent = bn(1000);

      const SetOwnerFee = await toEvents(
        tokenEscrow.setOwnerFee(
          tenPorcent,
          { from: owner }
        ),
        'SetOwnerFee'
      );

      expect(SetOwnerFee._fee).to.eq.BN(tenPorcent);

      expect(await tokenEscrow.ownerFee()).to.eq.BN(tenPorcent);
    });
    it('set 50% owner fee', async () => {
      const fiftyPorcent = bn(5000);

      const SetOwnerFee = await toEvents(
        tokenEscrow.setOwnerFee(
          fiftyPorcent,
          { from: owner }
        ),
        'SetOwnerFee'
      );

      expect(SetOwnerFee._fee).to.eq.BN(fiftyPorcent);

      expect(await tokenEscrow.ownerFee()).to.eq.BN(fiftyPorcent);
    });
    it('Try set a higth owner fee(>50%)', async function () {
      await tryCatchRevert(
        () => tokenEscrow.setOwnerFee(
          5001,
          { from: owner }
        ),
        'setOwnerFee: The owner fee should be low or equal than 5000'
      );

      await tryCatchRevert(
        () => tokenEscrow.setOwnerFee(
          maxUint(256),
          { from: owner }
        ),
        'setOwnerFee: The owner fee should be low or equal than 5000'
      );
    });
  });
  describe('Try execute functions with non-exists escrow', function () {
    it('Try approve non-exists escrow', async () => {
      await tryCatchRevert(
        () => tokenEscrow.approveEscrow(
          random32(),
          { from: agent }
        ),
        'approveEscrow: The sender should be the agent of the escrow'
      );
    });
    it('Try remove approve of non-exists escrow', async () => {
      await tryCatchRevert(
        () => tokenEscrow.removeApproveEscrow(
          random32(),
          { from: agent }
        ),
        'removeApproveEscrow: The sender should be the agent of the escrow'
      );
    });
    it('Try deposit in non-exists escrow', async () => {
      await tryCatchRevert(
        () => tokenEscrow.deposit(
          random32(),
          0,
          { from: agent }
        ),
        'deposit: The sender should be the depositant'
      );
    });
    it('Try withdraw to retreader of non-exists escrow', async () => {
      await tryCatchRevert(
        () => tokenEscrow.withdrawToRetreader(
          random32(),
          0,
          { from: agent }
        ),
        '_withdraw: Error wrong sender'
      );
    });
    it('Try withdraw to depositant of non-exists escrow', async () => {
      await tryCatchRevert(
        () => tokenEscrow.withdrawToDepositant(
          random32(),
          0,
          { from: agent }
        ),
        '_withdraw: Error wrong sender'
      );
    });
    it('Try cancel an non-exists escrow', async () => {
      await tryCatchRevert(
        () => tokenEscrow.cancel(
          random32(),
          { from: agent }
        ),
        'cancel: The sender should be the agent'
      );
    });
  });

/*
  function ownerWithdraw(
      IERC20 _token,
      address _to,
      uint256 _amount
  ) external onlyOwner {
      require(_to != address(0), 'ownerWithdraw: The to address 0 its invalid');

      ownerBalance[address(_token)] = ownerBalance[address(_token)].sub(_amount);

      require(
          _token.safeTransfer(_to, _amount),
          "ownerWithdraw: Error transfer to the owner"
      );

      emit OwnerWithdraw(_token, _to, _amount);
  }


  describe('Function ownerWithdraw', function () {
    it('set 10% owner fee', async () => {
      const tenPorcent = bn(1000);

      const SetOwnerFee = await toEvents(
        tokenEscrow.setOwnerFee(
          tenPorcent,
          { from: owner }
        ),
        'SetOwnerFee'
      );

      expect(SetOwnerFee._fee).to.eq.BN(tenPorcent);

      expect(await tokenEscrow.ownerFee()).to.eq.BN(tenPorcent);
    });
    it('set 50% owner fee', async () => {
      const fiftyPorcent = bn(5000);

      const SetOwnerFee = await toEvents(
        tokenEscrow.setOwnerFee(
          fiftyPorcent,
          { from: owner }
        ),
        'SetOwnerFee'
      );

      expect(SetOwnerFee._fee).to.eq.BN(fiftyPorcent);

      expect(await tokenEscrow.ownerFee()).to.eq.BN(fiftyPorcent);
    });
    it('Try set a higth owner fee(>50%)', async function () {
      await tryCatchRevert(
        () => tokenEscrow.setOwnerFee(
          5001,
          { from: owner }
        ),
        'The owner fee should be low or equal than 5000\\(50\\%\\)'
      );

      await tryCatchRevert(
        () => tokenEscrow.setOwnerFee(
          maxUint(256),
          { from: owner }
        ),
        'The owner fee should be low or equal than 5000\\(50\\%\\)'
      );
    });
  });
*/

  describe('Function createEscrow', function () {
    it('create basic escrow', async () => {
      const salt = random32bn();
      const id = calcId(depositant, retreader, agent, salt);

      const CreateEscrow = await toEvents(
        tokenEscrow.createEscrow(
          depositant,
          retreader,
          agent,
          0,
          erc20.address,
          salt,
          { from: creator }
        ),
        'CreateEscrow'
      );

      assert.equal(CreateEscrow._escrowId, id);
      assert.equal(CreateEscrow._depositant, depositant);
      assert.equal(CreateEscrow._retreader, retreader);
      assert.equal(CreateEscrow._agent, agent);
      expect(CreateEscrow._fee).to.eq.BN(0);
      assert.equal(CreateEscrow._token, erc20.address);
      expect(CreateEscrow._salt).to.eq.BN(salt);

      const escrow = await tokenEscrow.escrows(id);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.agent, agent);
      expect(escrow.fee).to.eq.BN(0);
      assert.equal(escrow.token, erc20.address);
      expect(escrow.balance).to.eq.BN(0);

      assert.equal(await tokenEscrow.approvedEscrows(id), false);
    });
    it('create basic escrow with agent as sender', async () => {
      const salt = random32bn();
      const id = calcId(depositant, retreader, agent, salt);

      const CreateEscrow = await toEvents(
        tokenEscrow.createEscrow(
          depositant,
          retreader,
          agent,
          1000,
          erc20.address,
          salt,
          { from: agent }
        ),
        'CreateEscrow'
      );

      assert.equal(CreateEscrow._escrowId, id);
      assert.equal(CreateEscrow._depositant, depositant);
      assert.equal(CreateEscrow._retreader, retreader);
      assert.equal(CreateEscrow._agent, agent);
      expect(CreateEscrow._fee).to.eq.BN(1000);
      assert.equal(CreateEscrow._token, erc20.address);
      expect(CreateEscrow._salt).to.eq.BN(salt);

      const escrow = await tokenEscrow.escrows(id);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.agent, agent);
      expect(escrow.fee).to.eq.BN(1000);
      assert.equal(escrow.token, erc20.address);
      expect(escrow.balance).to.eq.BN(0);

      assert.equal(await tokenEscrow.approvedEscrows(id), true);
    });
    it('Try create an escrow without agent', async function () {
      await tryCatchRevert(
        () => tokenEscrow.createEscrow(
          depositant,
          retreader,
          address0x,
          0,
          erc20.address,
          random32bn(),
          { from: creator }
        ),
        'createEscrow: The escrow should be have an agent'
      );
    });
    it('Try create two escrows with the same id', async function () {
      await createBasicEscrow();

      await tryCatchRevert(
        () => tokenEscrow.createEscrow(
          basicEscrow.depositant,
          basicEscrow.retreader,
          basicEscrow.agent,
          basicEscrow.fee,
          basicEscrow.token,
          basicEscrow.salt,
          { from: basicEscrow.agent }
        ),
        'createEscrow: The escrow exists'
      );
    });
    it('Try set a higth agent fee(>10%)', async function () {
      await tryCatchRevert(
        () => tokenEscrow.createEscrow(
          depositant,
          retreader,
          agent,
          1001,
          erc20.address,
          random32bn(),
          { from: creator }
        ),
        'createEscrow: The agent fee should be low or equal than 1000'
      );
      await tryCatchRevert(
        () => tokenEscrow.createEscrow(
          depositant,
          retreader,
          agent,
          maxUint(256),
          erc20.address,
          random32bn(),
          { from: creator }
        ),
        'createEscrow: The agent fee should be low or equal than 1000'
      );
    });
  });
  describe('Function approveEscrow', function () {
    it('create basic escrow from creator account and approve it', async () => {
      const escrowId = await createBasicEscrow();

      const ApproveEscrow = await toEvents(
        tokenEscrow.approveEscrow(
          escrowId,
          { from: basicEscrow.agent }
        ),
        'ApproveEscrow'
      );

      assert.equal(ApproveEscrow._escrowId, escrowId);

      assert.equal(await tokenEscrow.approvedEscrows(escrowId), true);
    });
    it('Try approve an escrow without be the agent', async () => {
      const escrowId = await createBasicEscrow();

      await tryCatchRevert(
        () => tokenEscrow.approveEscrow(
          escrowId,
          { from: creator }
        ),
        'approveEscrow: The sender should be the agent of the escrow'
      );

      assert.equal(await tokenEscrow.approvedEscrows(escrowId), false);
    });
  });
  describe('Function deposit', function () {
    it('Deposit erc20 in an escrow', async () => {
      const escrowId = await createBasicEscrowWithApprove();
      const amount = WEI;

      await setApproveBalance(depositant, amount);
      await saveBalances(escrowId);

      const Deposit = await toEvents(
        tokenEscrow.deposit(
          escrowId,
          amount,
          { from: depositant }
        ),
        'Deposit'
      );

      assert.equal(Deposit._escrowId, escrowId);
      const ownerFee = await tokenEscrow.ownerFee();
      const toOwner = amount.mul(ownerFee).div(BASE);
      const toEscrow = amount.sub(toOwner);
      expect(Deposit._toEscrow).to.eq.BN(toEscrow);
      expect(Deposit._toOwner).to.eq.BN(toOwner);

      const escrow = await tokenEscrow.escrows(escrowId);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.agent, agent);
      expect(escrow.fee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      assert.equal(await tokenEscrow.approvedEscrows(escrowId), true);

      expect(await tokenEscrow.ownerBalances(erc20.address)).to.eq.BN(prevOwnerBalance.add(toOwner));

      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.sub(amount));
      expect(await erc20.balanceOf(retreader)).to.eq.BN(prevBalRetreader);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent);

      expect(escrow.balance).to.eq.BN(prevBalEscrow.add(toEscrow));
      expect(await erc20.balanceOf(tokenEscrow.address)).to.eq.BN(prevBalTokenEscrow.add(amount));
    });
    it('Deposit 0 amount in an escrow', async () => {
      const escrowId = await createBasicEscrowWithApprove();
      const amount = bn(0);

      await setApproveBalance(depositant, amount);
      await saveBalances(escrowId);

      const Deposit = await toEvents(
        tokenEscrow.deposit(
          escrowId,
          amount,
          { from: depositant }
        ),
        'Deposit'
      );

      assert.equal(Deposit._escrowId, escrowId);
      const ownerFee = await tokenEscrow.ownerFee();
      const toOwner = amount.mul(ownerFee).div(BASE);
      const toEscrow = amount.sub(toOwner);
      expect(Deposit._toEscrow).to.eq.BN(toEscrow);
      expect(Deposit._toOwner).to.eq.BN(toOwner);

      const escrow = await tokenEscrow.escrows(escrowId);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.agent, agent);
      expect(escrow.fee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      assert.equal(await tokenEscrow.approvedEscrows(escrowId), true);

      expect(await tokenEscrow.ownerBalances(erc20.address)).to.eq.BN(prevOwnerBalance.add(toOwner));

      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.sub(amount));
      expect(await erc20.balanceOf(retreader)).to.eq.BN(prevBalRetreader);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent);

      expect(escrow.balance).to.eq.BN(prevBalEscrow.add(toEscrow));
      expect(await erc20.balanceOf(tokenEscrow.address)).to.eq.BN(prevBalTokenEscrow.add(amount));
    });
    it('Deposit higth amount in an escrow', async () => {
      const escrowId = await createBasicEscrowWithApprove();
      const amount = maxUint(240);

      await setApproveBalance(depositant, amount);
      await saveBalances(escrowId);

      const Deposit = await toEvents(
        tokenEscrow.deposit(
          escrowId,
          amount,
          { from: depositant }
        ),
        'Deposit'
      );

      assert.equal(Deposit._escrowId, escrowId);
      const ownerFee = await tokenEscrow.ownerFee();
      const toOwner = amount.mul(ownerFee).div(BASE);
      const toEscrow = amount.sub(toOwner);
      expect(Deposit._toEscrow).to.eq.BN(toEscrow);
      expect(Deposit._toOwner).to.eq.BN(toOwner);

      const escrow = await tokenEscrow.escrows(escrowId);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.agent, agent);
      expect(escrow.fee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      assert.equal(await tokenEscrow.approvedEscrows(escrowId), true);

      expect(await tokenEscrow.ownerBalances(erc20.address)).to.eq.BN(prevOwnerBalance.add(toOwner));

      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.sub(amount));
      expect(await erc20.balanceOf(retreader)).to.eq.BN(prevBalRetreader);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent);

      expect(escrow.balance).to.eq.BN(prevBalEscrow.add(toEscrow));
      expect(await erc20.balanceOf(tokenEscrow.address)).to.eq.BN(prevBalTokenEscrow.add(amount));
    });
    it('Try deposit in a non-approve escrow', async () => {
      const escrowId = await createBasicEscrow();

      await tryCatchRevert(
        () => tokenEscrow.deposit(
          escrowId,
          0,
          { from: depositant }
        ),
        'deposit: The escrow its not approved by the agent'
      );
    });
    it('Try deposit in an escrow without be the depositant', async () => {
      const escrowId = await createBasicEscrowWithApprove();

      await tryCatchRevert(
        () => tokenEscrow.deposit(
          escrowId,
          0,
          { from: creator }
        ),
        'deposit: The sender should be the depositant'
      );
    });
  });
  describe('Function withdrawToRetreader', function () {
    it('Withdraw to retreader an escrow from depositant', async () => {
      const escrowId = await createBasicEscrowWithApprove();
      await deposit(escrowId);
      const amount = WEI.div(bn(2));

      await saveBalances(escrowId);

      const Withdraw = await toEvents(
        tokenEscrow.withdrawToRetreader(
          escrowId,
          amount,
          { from: depositant }
        ),
        'Withdraw'
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, depositant);
      assert.equal(Withdraw._to, retreader);
      const escrow = await tokenEscrow.escrows(escrowId);
      const toAgent = amount.mul(escrow.fee).div(BASE);
      const toAmount = amount.sub(toAgent);
      expect(Withdraw._toAmount).to.eq.BN(toAmount);
      expect(Withdraw._toAgent).to.eq.BN(toAgent);

      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.agent, agent);
      expect(escrow.fee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      assert.equal(await tokenEscrow.approvedEscrows(escrowId), true);

      expect(await tokenEscrow.ownerBalances(erc20.address)).to.eq.BN(prevOwnerBalance);

      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant);
      expect(await erc20.balanceOf(retreader)).to.eq.BN(prevBalRetreader.add(toAmount));
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent.add(toAgent));

      expect(escrow.balance).to.eq.BN(prevBalEscrow.sub(amount));
      expect(await erc20.balanceOf(tokenEscrow.address)).to.eq.BN(prevBalTokenEscrow.sub(amount));
    });
    it('Withdraw to retreader an escrow from agent', async () => {
      const escrowId = await createBasicEscrowWithApprove();
      await deposit(escrowId);
      const amount = WEI.div(bn(2));

      await saveBalances(escrowId);

      const Withdraw = await toEvents(
        tokenEscrow.withdrawToRetreader(
          escrowId,
          amount,
          { from: agent }
        ),
        'Withdraw'
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, agent);
      assert.equal(Withdraw._to, retreader);
      const escrow = await tokenEscrow.escrows(escrowId);
      const toAgent = amount.mul(escrow.fee).div(BASE);
      const toAmount = amount.sub(toAgent);
      expect(Withdraw._toAmount).to.eq.BN(toAmount);
      expect(Withdraw._toAgent).to.eq.BN(toAgent);

      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.agent, agent);
      expect(escrow.fee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      assert.equal(await tokenEscrow.approvedEscrows(escrowId), true);

      expect(await tokenEscrow.ownerBalances(erc20.address)).to.eq.BN(prevOwnerBalance);

      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant);
      expect(await erc20.balanceOf(retreader)).to.eq.BN(prevBalRetreader.add(toAmount));
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent.add(toAgent));

      expect(escrow.balance).to.eq.BN(prevBalEscrow.sub(amount));
      expect(await erc20.balanceOf(tokenEscrow.address)).to.eq.BN(prevBalTokenEscrow.sub(amount));
    });
    it('Withdraw to retreader 0 amount', async () => {
      const escrowId = await createBasicEscrowWithApprove();
      await deposit(escrowId);
      const amount = bn(0);

      await saveBalances(escrowId);

      const Withdraw = await toEvents(
        tokenEscrow.withdrawToRetreader(
          escrowId,
          amount,
          { from: depositant }
        ),
        'Withdraw'
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, depositant);
      assert.equal(Withdraw._to, retreader);
      const escrow = await tokenEscrow.escrows(escrowId);
      const toAgent = amount.mul(escrow.fee).div(BASE);
      const toAmount = amount.sub(toAgent);
      expect(Withdraw._toAmount).to.eq.BN(toAmount);
      expect(Withdraw._toAgent).to.eq.BN(toAgent);

      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.agent, agent);
      expect(escrow.fee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      assert.equal(await tokenEscrow.approvedEscrows(escrowId), true);

      expect(await tokenEscrow.ownerBalances(erc20.address)).to.eq.BN(prevOwnerBalance);

      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant);
      expect(await erc20.balanceOf(retreader)).to.eq.BN(prevBalRetreader.add(toAmount));
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent.add(toAgent));

      expect(escrow.balance).to.eq.BN(prevBalEscrow.sub(amount));
      expect(await erc20.balanceOf(tokenEscrow.address)).to.eq.BN(prevBalTokenEscrow.sub(amount));
    });
    it('Try withdraw to retreader without be the depositant or the agent', async () => {
      const escrowId = await createBasicEscrowWithApprove();

      await tryCatchRevert(
        () => tokenEscrow.withdrawToRetreader(
          escrowId,
          0,
          { from: retreader }
        ),
        '_withdraw: Error wrong sender'
      );

      await tryCatchRevert(
        () => tokenEscrow.withdrawToRetreader(
          escrowId,
          0,
          { from: creator }
        ),
        '_withdraw: Error wrong sender'
      );
    });
  });
  describe('Function withdrawToDepositant', function () {
    it('Withdraw to depositant an escrow from retreader', async () => {
      const escrowId = await createBasicEscrowWithApprove();
      await deposit(escrowId);
      const amount = WEI.div(bn(2));

      await saveBalances(escrowId);

      const Withdraw = await toEvents(
        tokenEscrow.withdrawToDepositant(
          escrowId,
          amount,
          { from: retreader }
        ),
        'Withdraw'
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, retreader);
      assert.equal(Withdraw._to, depositant);
      const escrow = await tokenEscrow.escrows(escrowId);
      const toAgent = amount.mul(escrow.fee).div(BASE);
      const toAmount = amount.sub(toAgent);
      expect(Withdraw._toAmount).to.eq.BN(toAmount);
      expect(Withdraw._toAgent).to.eq.BN(toAgent);

      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.agent, agent);
      expect(escrow.fee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      assert.equal(await tokenEscrow.approvedEscrows(escrowId), true);

      expect(await tokenEscrow.ownerBalances(erc20.address)).to.eq.BN(prevOwnerBalance);

      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.add(toAmount));
      expect(await erc20.balanceOf(retreader)).to.eq.BN(prevBalRetreader);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent.add(toAgent));

      expect(escrow.balance).to.eq.BN(prevBalEscrow.sub(amount));
      expect(await erc20.balanceOf(tokenEscrow.address)).to.eq.BN(prevBalTokenEscrow.sub(amount));
    });
    it('Withdraw to depositant an escrow from agent', async () => {
      const escrowId = await createBasicEscrowWithApprove();
      await deposit(escrowId);
      const amount = WEI.div(bn(2));

      await saveBalances(escrowId);

      const Withdraw = await toEvents(
        tokenEscrow.withdrawToDepositant(
          escrowId,
          amount,
          { from: agent }
        ),
        'Withdraw'
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, agent);
      assert.equal(Withdraw._to, depositant);
      const escrow = await tokenEscrow.escrows(escrowId);
      const toAgent = amount.mul(escrow.fee).div(BASE);
      const toAmount = amount.sub(toAgent);
      expect(Withdraw._toAmount).to.eq.BN(toAmount);
      expect(Withdraw._toAgent).to.eq.BN(toAgent);

      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.agent, agent);
      expect(escrow.fee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      assert.equal(await tokenEscrow.approvedEscrows(escrowId), true);

      expect(await tokenEscrow.ownerBalances(erc20.address)).to.eq.BN(prevOwnerBalance);

      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.add(toAmount));
      expect(await erc20.balanceOf(retreader)).to.eq.BN(prevBalRetreader);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent.add(toAgent));

      expect(escrow.balance).to.eq.BN(prevBalEscrow.sub(amount));
      expect(await erc20.balanceOf(tokenEscrow.address)).to.eq.BN(prevBalTokenEscrow.sub(amount));
    });
    it('Withdraw to depositant 0 amount', async () => {
      const escrowId = await createBasicEscrowWithApprove();
      await deposit(escrowId);
      const amount = bn(0);

      await saveBalances(escrowId);

      const Withdraw = await toEvents(
        tokenEscrow.withdrawToDepositant(
          escrowId,
          amount,
          { from: retreader }
        ),
        'Withdraw'
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, retreader);
      assert.equal(Withdraw._to, depositant);
      const escrow = await tokenEscrow.escrows(escrowId);
      const toAgent = amount.mul(escrow.fee).div(BASE);
      const toAmount = amount.sub(toAgent);
      expect(Withdraw._toAmount).to.eq.BN(toAmount);
      expect(Withdraw._toAgent).to.eq.BN(toAgent);

      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.agent, agent);
      expect(escrow.fee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      assert.equal(await tokenEscrow.approvedEscrows(escrowId), true);

      expect(await tokenEscrow.ownerBalances(erc20.address)).to.eq.BN(prevOwnerBalance);

      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.add(toAmount));
      expect(await erc20.balanceOf(retreader)).to.eq.BN(prevBalRetreader);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent.add(toAgent));

      expect(escrow.balance).to.eq.BN(prevBalEscrow.sub(amount));
      expect(await erc20.balanceOf(tokenEscrow.address)).to.eq.BN(prevBalTokenEscrow.sub(amount));
    });
    it('Try withdraw to depositant without be the retreader or the agent', async () => {
      const escrowId = await createBasicEscrowWithApprove();

      await tryCatchRevert(
        () => tokenEscrow.withdrawToDepositant(
          escrowId,
          0,
          { from: depositant }
        ),
        '_withdraw: Error wrong sender'
      );

      await tryCatchRevert(
        () => tokenEscrow.withdrawToDepositant(
          escrowId,
          0,
          { from: creator }
        ),
        '_withdraw: Error wrong sender'
      );
    });
  });
  describe('Function cancel', function () {
    it('Cancel an escrow', async () => {
      const escrowId = await createBasicEscrowWithApprove();
      await deposit(escrowId);

      await saveBalances(escrowId);

      const Cancel = await toEvents(
        tokenEscrow.cancel(
          escrowId,
          { from: agent }
        ),
        'Cancel'
      );

      assert.equal(Cancel._escrowId, escrowId);
      expect(Cancel._amount).to.eq.BN(prevBalEscrow);

      const escrow = await tokenEscrow.escrows(escrowId);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.agent, agent);
      expect(escrow.fee).to.eq.BN(500);
      assert.equal(escrow.token, erc20.address);

      assert.equal(await tokenEscrow.approvedEscrows(escrowId), false);

      expect(await tokenEscrow.ownerBalances(erc20.address)).to.eq.BN(prevOwnerBalance);

      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalOwner);
      expect(await erc20.balanceOf(creator)).to.eq.BN(prevBalCreator);
      expect(await erc20.balanceOf(depositant)).to.eq.BN(prevBalDepositant.add(prevBalEscrow));
      expect(await erc20.balanceOf(retreader)).to.eq.BN(prevBalRetreader);
      expect(await erc20.balanceOf(agent)).to.eq.BN(prevBalAgent);

      expect(escrow.balance).to.eq.BN(0);
      expect(await erc20.balanceOf(tokenEscrow.address)).to.eq.BN(prevBalTokenEscrow.sub(prevBalEscrow));
    });
    it('Try cancel without be the agent', async () => {
      const escrowId = await createBasicEscrowWithApprove();

      await tryCatchRevert(
        () => tokenEscrow.cancel(
          escrowId,
          { from: depositant }
        ),
        'cancel: The sender should be the agent'
      );
    });
  });
});
