const TestToken = artifacts.require('TestToken');

const EmytoTokenEscrow = artifacts.require('EmytoTokenEscrow');

const {
  expect,
  toEvents,
} = require('./Helper.js');

contract('EmytoTokenEscrow', (accounts) => {
  const owner = accounts[1];
  const creator = accounts[2];
  const depositant = accounts[3];
  const retreader = accounts[4];
  const agent = accounts[5];

  let tokenEscrow;
  let erc20;

  before('Deploy contracts', async function () {
    tokenEscrow = await EmytoTokenEscrow.new(0, { from: owner });

    erc20 = await TestToken.new({ from: owner });
  });

  describe('function createEscrow', function () {
    it('create basic escrow', async () => {
      const CreateEscrow = await toEvents(
        tokenEscrow.createEscrow(
          depositant,
          retreader,
          agent,
          0,
          erc20.address,
          { from: creator }
        ),
        'CreateEscrow'
      );

      expect(CreateEscrow._escrowId).to.eq.BN(0);
      assert.equal(CreateEscrow._depositant, depositant);
      assert.equal(CreateEscrow._retreader, retreader);
      assert.equal(CreateEscrow._agent, agent);
      expect(CreateEscrow.fee).to.eq.BN(0);
      assert.equal(CreateEscrow._token, erc20.address);

      const escrow = await tokenEscrow.escrows(0);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.agent, agent);
      expect(escrow.fee).to.eq.BN(0);
      assert.equal(escrow.token, erc20.address);
      expect(escrow.balance).to.eq.BN(0);

      assert.equal(await tokenEscrow.approvedEscrows(0), false);
    });
  });
});
