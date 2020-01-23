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

  let tokenEscrow;
  let erc20;

  let salt = 0;
  let basicEscrow;

  async function setApproveBalance (beneficiary, amount) {
    await erc20.setBalance(beneficiary, amount, { from: owner });
    await erc20.approve(tokenEscrow.address, amount, { from: beneficiary });
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
    const ownerFee = await tokenEscrow.ownerFee();
    const toOwner = amount.mul(ownerFee).div(BASE);
    await setApproveBalance(escrow.depositant, amount.add(toOwner));

    await tokenEscrow.deposit(escrowId, amount, { from: escrow.depositant });
  }

  before('Deploy contracts', async function () {
    tokenEscrow = await EmytoTokenEscrow.new({ from: owner });

    erc20 = await TestToken.new({ from: owner });

    BASE = await tokenEscrow.BASE();

    basicEscrow = {
      depositant: depositant,
      retreader: retreader,
      agent: agent,
      fee: 0,
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
  describe('Function removeApproveEscrow', function () {
    it('Create basic escrow and remove approve', async () => {
      const escrowId = await createBasicEscrowWithApprove();

      const RemoveApproveEscrow = await toEvents(
        tokenEscrow.removeApproveEscrow(
          escrowId,
          { from: basicEscrow.agent }
        ),
        'RemoveApproveEscrow'
      );

      assert.equal(RemoveApproveEscrow._escrowId, escrowId);

      assert.equal(await tokenEscrow.approvedEscrows(escrowId), false);
    });
    it('Try remove approve of an escrow without be the agent', async () => {
      const escrowId = await createBasicEscrowWithApprove();

      await tryCatchRevert(
        () => tokenEscrow.removeApproveEscrow(
          escrowId,
          { from: creator }
        ),
        'removeApproveEscrow: The sender should be the agent of the escrow'
      );

      assert.equal(await tokenEscrow.approvedEscrows(escrowId), true);
    });
    it('Try remove approve of an escrow with balance', async () => {
      const escrowId = await createBasicEscrowWithApprove();

      await deposit(escrowId);

      await tryCatchRevert(
        () => tokenEscrow.removeApproveEscrow(
          escrowId,
          { from: agent }
        ),
        'removeApproveEscrow: The escrow still have amount'
      );

      assert.equal(await tokenEscrow.approvedEscrows(escrowId), true);
    });
  });
});
