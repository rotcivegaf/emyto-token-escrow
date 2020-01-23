const TestToken = artifacts.require('TestToken');

const EmytoTokenEscrow = artifacts.require('EmytoTokenEscrow');

const {
  bn,
  expect,
  toEvents,
  tryCatchRevert,
  address0x,
  maxUint,
  random32bn,
} = require('./Helper.js');

contract('EmytoTokenEscrow', (accounts) => {
  const owner = accounts[1];
  const creator = accounts[2];
  const depositant = accounts[3];
  const retreader = accounts[4];
  const agent = accounts[5];

  let tokenEscrow;
  let erc20;

  function calcId(depositant, retreader, agent, salt) {
    return web3.utils.soliditySha3(
        { t: 'address', v: tokenEscrow.address },
        { t: 'address', v: depositant },
        { t: 'address', v: retreader },
        { t: 'address', v: agent },
        { t: 'uint256', v: salt }
    );
  }

  before('Deploy contracts', async function () {
    tokenEscrow = await EmytoTokenEscrow.new({ from: owner });

    erc20 = await TestToken.new({ from: owner });
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
  describe('function setOwnerFee', function () {
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
  describe('function createEscrow', function () {
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

      expect(CreateEscrow._escrowId).to.eq.BN(id);
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

      expect(CreateEscrow._escrowId).to.eq.BN(id);
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
        'The agent fee should be low or equal than 1000\\(10\\%\\)'
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
        'The agent fee should be low or equal than 1000\\(10\\%\\)'
      );
    });
  });
});
