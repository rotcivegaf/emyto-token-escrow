const TestERC721 = artifacts.require('TestERC721');

const EmytoERC721Escrow = artifacts.require('EmytoERC721Escrow');

const {
  constants,
  expectEvent,
  expectRevert,
} = require('@openzeppelin/test-helpers');

const {
  expect,
  random32,
  random32bn,
  sign,
} = require('./Helper.js');

contract('EmytoERC721Escrow', (accounts) => {
  const owner = accounts[1];
  const creator = accounts[2];
  const agent = accounts[5];
  const depositant = accounts[3];
  const retreader = accounts[4];

  let tokenEscrow;
  let erc721;

  let salt = 0;
  let basicEscrow;

  async function createApprove (beneficiary, tokenId) {
    await erc721.mint(beneficiary, tokenId, { from: owner });
    await erc721.approve(tokenEscrow.address, tokenId, { from: beneficiary });
  }

  async function calcId (agent, depositant, retreader, token, tokenId, salt) {
    const id = await tokenEscrow.calculateId(
      agent,
      depositant,
      retreader,
      token,
      tokenId,
      salt,
    );

    const localId = web3.utils.soliditySha3(
      { t: 'address', v: tokenEscrow.address },
      { t: 'address', v: agent },
      { t: 'address', v: depositant },
      { t: 'address', v: retreader },
      { t: 'address', v: token },
      { t: 'uint256', v: tokenId },
      { t: 'uint256', v: salt },
    );

    assert.equal(id, localId);

    return id;
  }

  async function createBasicEscrow () {
    basicEscrow.salt = ++salt;
    basicEscrow.tokenId = basicEscrow.salt;

    await tokenEscrow.createEscrow(
      basicEscrow.depositant,
      basicEscrow.retreader,
      basicEscrow.token,
      basicEscrow.tokenId,
      basicEscrow.salt,
      { from: basicEscrow.agent },
    );

    return calcId(basicEscrow.agent, basicEscrow.depositant, basicEscrow.retreader, basicEscrow.token, basicEscrow.tokenId, basicEscrow.salt);
  }

  async function deposit (escrowId) {
    const escrow = await tokenEscrow.escrows(escrowId);
    await createApprove(escrow.depositant, escrow.tokenId);

    await tokenEscrow.deposit(escrowId, { from: escrow.depositant });
  }

  before('Deploy contracts', async function () {
    tokenEscrow = await EmytoERC721Escrow.new({ from: owner });

    erc721 = await TestERC721.new({ from: owner });

    basicEscrow = {
      agent: agent,
      depositant: depositant,
      retreader: retreader,
      token: erc721.address,
      tokenId: random32bn(),
      salt: salt,
    };
  });

  describe('Try execute functions with non-exists escrow', function () {
    it('Try deposit in non-exists escrow', async () => {
      await expectRevert(
        tokenEscrow.deposit(random32(), { from: agent }),
        'EmytoERC721Escrow::deposit: The sender should be the depositant',
      );
    });
    it('Try withdraw to retreader of non-exists escrow', async () => {
      await expectRevert(
        tokenEscrow.withdrawToRetreader(random32(), { from: agent }),
        'EmytoERC721Escrow::_withdraw: The sender should be the _approved or the agent',
      );
    });
    it('Try withdraw to depositant of non-exists escrow', async () => {
      await expectRevert(
        tokenEscrow.withdrawToDepositant(random32(), { from: agent }),
        'EmytoERC721Escrow::_withdraw: The sender should be the _approved or the agent',
      );
    });
    it('Try cancel an non-exists escrow', async () => {
      await expectRevert(
        tokenEscrow.cancel(random32(), { from: agent }),
        'EmytoERC721Escrow::cancel: The sender should be the agent',
      );
    });
  });
  describe('Function createEscrow', function () {
    it('Create basic escrow', async () => {
      const salt = random32bn();
      const tokenId = random32bn();
      const id = await calcId(agent, depositant, retreader, erc721.address, tokenId, salt);

      expectEvent(
        await tokenEscrow.createEscrow(depositant, retreader, erc721.address, tokenId, salt, { from: agent }),
        'CreateEscrow',
        { escrowId: id, agent: agent, depositant: depositant, retreader: retreader, token: erc721.address, tokenId: tokenId, salt: salt },
      );

      const escrow = await tokenEscrow.escrows(id);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.token, erc721.address);
      expect(escrow.tokenId).to.eq.BN(tokenId);
    });
    it('Try create two escrows with the same id', async function () {
      const escrowId = await createBasicEscrow();

      await expectRevert(
        tokenEscrow.createEscrow(
          basicEscrow.depositant,
          basicEscrow.retreader,
          basicEscrow.token,
          basicEscrow.tokenId,
          basicEscrow.salt,
          { from: basicEscrow.agent },
        ),
        'EmytoERC721Escrow::createEscrow: The escrow exists',
      );

      // With signature
      const agentSignature = await web3.eth.sign(escrowId, basicEscrow.agent);
      await expectRevert(
        tokenEscrow.signedCreateEscrow(
          basicEscrow.agent,
          basicEscrow.depositant,
          basicEscrow.retreader,
          basicEscrow.token,
          basicEscrow.tokenId,
          basicEscrow.salt,
          agentSignature,
          { from: creator },
        ),
        'EmytoERC721Escrow::createEscrow: The escrow exists',
      );
    });
  });
  describe('Function signedCreateEscrow', function () {
    it('Create a signed basic escrow', async () => {
      const salt = random32bn();
      const tokenId = random32bn();
      const id = await calcId(agent, depositant, retreader, erc721.address, tokenId, salt);

      const agentSignature = await web3.eth.sign(id, agent);

      expectEvent(
        await tokenEscrow.signedCreateEscrow(agent, depositant, retreader, erc721.address, tokenId, salt, agentSignature, { from: creator }),
        'SignedCreateEscrow',
        { escrowId: id, agentSignature: agentSignature },
      );
    });
    it('Try create two escrows with the same id', async function () {
      const salt = random32bn();
      const tokenId = random32bn();
      const id = await calcId(agent, depositant, retreader, erc721.address, tokenId, salt);

      const agentSignature = await web3.eth.sign(id, agent);

      await tokenEscrow.signedCreateEscrow(
        agent,
        depositant,
        retreader,
        erc721.address,
        tokenId,
        salt,
        agentSignature,
        { from: creator },
      );

      await expectRevert(
        tokenEscrow.createEscrow(depositant, retreader, erc721.address, tokenId, salt, { from: agent }),
        'EmytoERC721Escrow::createEscrow: The escrow exists',
      );

      await expectRevert(
        tokenEscrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          erc721.address,
          tokenId,
          salt,
          agentSignature,
          { from: creator },
        ),
        'EmytoERC721Escrow::createEscrow: The escrow exists',
      );
    });
    it('Try create a signed basic escrow with invalid signature', async () => {
      const salt = random32bn();

      // With wrong id
      const wrongSignature = await web3.eth.sign([], agent);
      await expectRevert(
        tokenEscrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          erc721.address,
          random32bn(),
          salt,
          wrongSignature,
          { from: creator },
        ),
        'EmytoERC721Escrow::signedCreateEscrow: Invalid agent signature',
      );

      // With wrong agent in calcId
      const tokenId = random32();
      const id = await calcId(creator, depositant, retreader, erc721.address, tokenId, salt);
      const wrongSignature2 = await web3.eth.sign(id, agent);

      await expectRevert(
        tokenEscrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          erc721.address,
          tokenId,
          salt,
          wrongSignature2,
          { from: creator },
        ),
        'EmytoERC721Escrow::signedCreateEscrow: Invalid agent signature',
      );

      // With wrong signer
      const wrongSignature3 = await web3.eth.sign(id, creator);

      await expectRevert(
        tokenEscrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          erc721.address,
          tokenId,
          salt,
          wrongSignature3,
          { from: creator },
        ),
        'EmytoERC721Escrow::signedCreateEscrow: Invalid agent signature',
      );
    });
    it('Try create a signed basic escrow with canceled signature', async () => {
      const tokenId = random32();
      const id = await calcId(agent, depositant, retreader, erc721.address, tokenId, salt);
      const canceledSignature = await web3.eth.sign(id, agent);

      await tokenEscrow.cancelSignature(canceledSignature, { from: agent });

      await expectRevert(
        tokenEscrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          erc721.address,
          tokenId,
          salt,
          canceledSignature,
          { from: creator },
        ),
        'EmytoERC721Escrow::signedCreateEscrow: The signature was canceled',
      );
    });
  });
  describe('Function cancelSignature', function () {
    it('cancel a signature', async () => {
      const id = await calcId(agent, depositant, retreader, erc721.address, random32bn(), random32bn());

      const agentSignature = await web3.eth.sign(id, agent);

      assert.isFalse(await tokenEscrow.canceledSignatures(agent, agentSignature));

      expectEvent(
        await tokenEscrow.cancelSignature(agentSignature, { from: agent }),
        'CancelSignature',
        { agentSignature: agentSignature },
      );

      assert.isTrue(await tokenEscrow.canceledSignatures(agent, agentSignature));
    });
  });
  describe('Function deposit', function () {
    it('Deposit erc721 in an escrow', async () => {
      const escrowId = await createBasicEscrow();

      await createApprove(depositant, basicEscrow.tokenId);

      expectEvent(
        await tokenEscrow.deposit(escrowId, { from: depositant }),
        'Deposit',
        { escrowId: escrowId },
      );

      const escrow = await tokenEscrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.token, erc721.address);
      expect(escrow.tokenId).to.eq.BN(basicEscrow.tokenId);

      assert.equal(await erc721.ownerOf(basicEscrow.tokenId), tokenEscrow.address);
    });
    it('Try deposit in an escrow without be the depositant', async () => {
      const escrowId = await createBasicEscrow();

      await expectRevert(
        tokenEscrow.deposit(escrowId, { from: creator }),
        'EmytoERC721Escrow::deposit: The sender should be the depositant',
      );
    });
  });
  describe('Function withdrawToRetreader', function () {
    it('Withdraw to retreader an escrow from depositant', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);

      expectEvent(
        await tokenEscrow.withdrawToRetreader(escrowId, { from: depositant }),
        'Withdraw',
        { escrowId: escrowId, to: retreader },
      );

      const escrow = await tokenEscrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.token, erc721.address);
      expect(escrow.tokenId).to.eq.BN(basicEscrow.tokenId);

      assert.equal(await erc721.ownerOf(basicEscrow.tokenId), escrow.retreader);
    });
    it('Withdraw to retreader an escrow from agent', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);

      expectEvent(
        await tokenEscrow.withdrawToRetreader(escrowId, { from: agent }),
        'Withdraw',
        { escrowId: escrowId, to: retreader },
      );

      const escrow = await tokenEscrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.token, erc721.address);
      expect(escrow.tokenId).to.eq.BN(basicEscrow.tokenId);

      assert.equal(await erc721.ownerOf(basicEscrow.tokenId), escrow.retreader);
    });
    it('Try withdraw to retreader without be the depositant or the agent', async () => {
      const escrowId = await createBasicEscrow();

      await expectRevert(
        tokenEscrow.withdrawToRetreader(escrowId, { from: retreader }),
        'EmytoERC721Escrow::_withdraw: The sender should be the _approved or the agent',
      );

      await expectRevert(
        tokenEscrow.withdrawToRetreader(escrowId, { from: creator }),
        'EmytoERC721Escrow::_withdraw: The sender should be the _approved or the agent',
      );
    });
  });
  describe('Function withdrawToDepositant', function () {
    it('Withdraw to depositant an escrow from retreader', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);

      expectEvent(
        await tokenEscrow.withdrawToDepositant(escrowId, { from: retreader }),
        'Withdraw',
        { escrowId: escrowId, to: depositant },
      );

      const escrow = await tokenEscrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.token, erc721.address);
      expect(escrow.tokenId).to.eq.BN(basicEscrow.tokenId);

      assert.equal(await erc721.ownerOf(basicEscrow.tokenId), escrow.depositant);
    });
    it('Withdraw to depositant an escrow from agent', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);

      expectEvent(
        await tokenEscrow.withdrawToDepositant(escrowId, { from: agent }),
        'Withdraw',
        { escrowId: escrowId, to: depositant },
      );

      const escrow = await tokenEscrow.escrows(escrowId);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.token, erc721.address);
      expect(escrow.tokenId).to.eq.BN(basicEscrow.tokenId);

      assert.equal(await erc721.ownerOf(basicEscrow.tokenId), escrow.depositant);
    });
    it('Try withdraw to depositant without be the retreader or the agent', async () => {
      const escrowId = await createBasicEscrow();

      await expectRevert(
        tokenEscrow.withdrawToDepositant(escrowId, { from: depositant }),
        'EmytoERC721Escrow::_withdraw: The sender should be the _approved or the agent',
      );

      await expectRevert(
        tokenEscrow.withdrawToDepositant(escrowId, { from: creator }),
        'EmytoERC721Escrow::_withdraw: The sender should be the _approved or the agent',
      );
    });
  });
  describe('Function cancel', function () {
    it('Cancel an escrow', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);

      expectEvent(
        await tokenEscrow.cancel(escrowId, { from: agent }),
        'Cancel',
        { escrowId: escrowId },
      );

      const escrow = await tokenEscrow.escrows(escrowId);
      assert.equal(escrow.depositant, constants.ZERO_ADDRESS);
      assert.equal(escrow.retreader, constants.ZERO_ADDRESS);
      assert.equal(escrow.agent, constants.ZERO_ADDRESS);
      expect(escrow.fee).to.eq.BN(0);
      assert.equal(escrow.token, constants.ZERO_ADDRESS);

      assert.equal(await erc721.ownerOf(basicEscrow.tokenId), depositant);
    });
    it('Try cancel without be the agent', async () => {
      const escrowId = await createBasicEscrow();

      await expectRevert(
        tokenEscrow.cancel(escrowId, { from: depositant }),
        'cancel: The sender should be the agent',
      );
    });
  });
});
