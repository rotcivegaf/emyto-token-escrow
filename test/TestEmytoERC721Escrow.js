const TestERC721Token = artifacts.require('TestERC721Token');

const EmytoERC721Escrow = artifacts.require('EmytoERC721Escrow');

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
    await erc721.generate(beneficiary, tokenId, { from: owner });
    await erc721.approve(tokenEscrow.address, tokenId, { from: beneficiary });
  }

  async function calcId (agent, depositant, retreader, token, tokenId, salt) {
    const id = await tokenEscrow.calculateId(
      agent,
      depositant,
      retreader,
      token,
      tokenId,
      salt
    );

    const localId = web3.utils.soliditySha3(
      { t: 'address', v: tokenEscrow.address },
      { t: 'address', v: agent },
      { t: 'address', v: depositant },
      { t: 'address', v: retreader },
      { t: 'address', v: token },
      { t: 'uint256', v: tokenId },
      { t: 'uint256', v: salt }
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
      { from: basicEscrow.agent }
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

    erc721 = await TestERC721Token.new({ from: owner });

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
      await tryCatchRevert(
        () => tokenEscrow.deposit(
          random32(),
          { from: agent }
        ),
        'deposit: The sender should be the depositant'
      );
    });
    it('Try withdraw to retreader of non-exists escrow', async () => {
      await tryCatchRevert(
        () => tokenEscrow.withdrawToRetreader(
          random32(),
          { from: agent }
        ),
        '_withdraw: The sender should be the _approved or the agent'
      );
    });
    it('Try withdraw to depositant of non-exists escrow', async () => {
      await tryCatchRevert(
        () => tokenEscrow.withdrawToDepositant(
          random32(),
          { from: agent }
        ),
        '_withdraw: The sender should be the _approved or the agent'
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
      const tokenId = random32bn();
      const id = await calcId(agent, depositant, retreader, erc721.address, tokenId, salt);

      const CreateEscrow = await toEvents(
        tokenEscrow.createEscrow(
          depositant,
          retreader,
          erc721.address,
          tokenId,
          salt,
          { from: agent }
        ),
        'CreateEscrow'
      );

      assert.equal(CreateEscrow._escrowId, id);
      assert.equal(CreateEscrow._agent, agent);
      assert.equal(CreateEscrow._depositant, depositant);
      assert.equal(CreateEscrow._retreader, retreader);
      assert.equal(CreateEscrow._token, erc721.address);
      expect(CreateEscrow._tokenId).to.eq.BN(tokenId);
      expect(CreateEscrow._salt).to.eq.BN(salt);

      const escrow = await tokenEscrow.escrows(id);
      assert.equal(escrow.agent, agent);
      assert.equal(escrow.depositant, depositant);
      assert.equal(escrow.retreader, retreader);
      assert.equal(escrow.token, erc721.address);
      expect(escrow.tokenId).to.eq.BN(tokenId);
    });
    it('Try create two escrows with the same id', async function () {
      const escrowId = await createBasicEscrow();

      await tryCatchRevert(
        () => tokenEscrow.createEscrow(
          basicEscrow.depositant,
          basicEscrow.retreader,
          basicEscrow.token,
          basicEscrow.tokenId,
          basicEscrow.salt,
          { from: basicEscrow.agent }
        ),
        'createEscrow: The escrow exists'
      );

      // With signature
      const agentSignature = await web3.eth.sign(escrowId, basicEscrow.agent);
      await tryCatchRevert(
        () => tokenEscrow.signedCreateEscrow(
          basicEscrow.agent,
          basicEscrow.depositant,
          basicEscrow.retreader,
          basicEscrow.token,
          basicEscrow.tokenId,
          basicEscrow.salt,
          agentSignature,
          { from: creator }
        ),
        'createEscrow: The escrow exists'
      );
    });
  });
  describe('Function signedCreateEscrow', function () {
    it('create a signed basic escrow', async () => {
      const salt = random32bn();
      const tokenId = random32bn();
      const id = await calcId(agent, depositant, retreader, erc721.address, tokenId, salt);

      const agentSignature = await web3.eth.sign(id, agent);

      const SignedCreateEscrow = await toEvents(
        tokenEscrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          erc721.address,
          tokenId,
          salt,
          agentSignature,
          { from: creator }
        ),
        'SignedCreateEscrow'
      );

      assert.equal(SignedCreateEscrow._escrowId, id);
      assert.equal(SignedCreateEscrow._agentSignature, agentSignature);
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
        { from: creator }
      );

      await tryCatchRevert(
        () => tokenEscrow.createEscrow(
          depositant,
          retreader,
          erc721.address,
          tokenId,
          salt,
          { from: agent }
        ),
        'createEscrow: The escrow exists'
      );

      await tryCatchRevert(
        () => tokenEscrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          erc721.address,
          tokenId,
          salt,
          agentSignature,
          { from: creator }
        ),
        'createEscrow: The escrow exists'
      );
    });
    it('try create a signed basic escrow with invalid signature', async () => {
      const salt = random32bn();

      // With wrong id
      const wrongSignature = await web3.eth.sign([], agent);
      await tryCatchRevert(
        () => tokenEscrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          erc721.address,
          random32bn(),
          salt,
          wrongSignature,
          { from: creator }
        ),
        'signedCreateEscrow: Invalid agent signature'
      );

      // With wrong agent in calcId
      const tokenId = random32();
      const id = await calcId(creator, depositant, retreader, erc721.address, tokenId, salt);
      const wrongSignature2 = await web3.eth.sign(id, agent);

      await tryCatchRevert(
        () => tokenEscrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          erc721.address,
          tokenId,
          salt,
          wrongSignature2,
          { from: creator }
        ),
        'signedCreateEscrow: Invalid agent signature'
      );

      // With wrong signer
      const id2 = await calcId(agent, depositant, retreader, erc721.address, tokenId, salt);
      const wrongSignature3 = await web3.eth.sign(id, creator);

      await tryCatchRevert(
        () => tokenEscrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          erc721.address,
          tokenId,
          salt,
          wrongSignature3,
          { from: creator }
        ),
        'signedCreateEscrow: Invalid agent signature'
      );
    });
    it('try create a signed basic escrow with canceled signature', async () => {
      const tokenId = random32();
      const id = await calcId(agent, depositant, retreader, erc721.address, tokenId, salt);
      const canceledSignature = await web3.eth.sign(id, agent);

      await tokenEscrow.cancelSignature(canceledSignature, { from: agent });

      await tryCatchRevert(
        () => tokenEscrow.signedCreateEscrow(
          agent,
          depositant,
          retreader,
          erc721.address,
          tokenId,
          salt,
          canceledSignature,
          { from: creator }
        ),
        'signedCreateEscrow: The signature was canceled'
      );
    });
  });
  describe('Function cancelSignature', function () {
    it('cancel a signature', async () => {
      const id = await calcId(agent, depositant, retreader, erc721.address, random32bn(), random32bn());

      const agentSignature = await web3.eth.sign(id, agent);

      assert.isFalse(await tokenEscrow.canceledSignatures(agent, agentSignature));

      const CancelSignature = await toEvents(
        tokenEscrow.cancelSignature(
          agentSignature,
          { from: agent }
        ),
        'CancelSignature'
      );

      assert.equal(CancelSignature._agentSignature, agentSignature);
      assert.isTrue(await tokenEscrow.canceledSignatures(agent, agentSignature));
    });
  });
  describe('Function deposit', function () {
    it('Deposit erc721 in an escrow', async () => {
      const escrowId = await createBasicEscrow();

      await createApprove(depositant, basicEscrow.tokenId);

      const Deposit = await toEvents(
        tokenEscrow.deposit(
          escrowId,
          { from: depositant }
        ),
        'Deposit'
      );

      assert.equal(Deposit._escrowId, escrowId);

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

      await tryCatchRevert(
        () => tokenEscrow.deposit(
          escrowId,
          { from: creator }
        ),
        'deposit: The sender should be the depositant'
      );
    });
  });
  describe('Function withdrawToRetreader', function () {
    it('Withdraw to retreader an escrow from depositant', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);

      const Withdraw = await toEvents(
        tokenEscrow.withdrawToRetreader(
          escrowId,
          { from: depositant }
        ),
        'Withdraw'
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, depositant);
      assert.equal(Withdraw._to, retreader);

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

      const Withdraw = await toEvents(
        tokenEscrow.withdrawToRetreader(
          escrowId,
          { from: agent }
        ),
        'Withdraw'
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, agent);
      assert.equal(Withdraw._to, retreader);

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

      await tryCatchRevert(
        () => tokenEscrow.withdrawToRetreader(
          escrowId,
          { from: retreader }
        ),
        '_withdraw: The sender should be the _approved or the agent'
      );

      await tryCatchRevert(
        () => tokenEscrow.withdrawToRetreader(
          escrowId,
          { from: creator }
        ),
        '_withdraw: The sender should be the _approved or the agent'
      );
    });
  });
  describe('Function withdrawToDepositant', function () {
    it('Withdraw to depositant an escrow from retreader', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);

      const Withdraw = await toEvents(
        tokenEscrow.withdrawToDepositant(
          escrowId,
          { from: retreader }
        ),
        'Withdraw'
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, retreader);
      assert.equal(Withdraw._to, depositant);

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

      const Withdraw = await toEvents(
        tokenEscrow.withdrawToDepositant(
          escrowId,
          { from: agent }
        ),
        'Withdraw'
      );

      assert.equal(Withdraw._escrowId, escrowId);
      assert.equal(Withdraw._sender, agent);
      assert.equal(Withdraw._to, depositant);

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

      await tryCatchRevert(
        () => tokenEscrow.withdrawToDepositant(
          escrowId,
          { from: depositant }
        ),
        '_withdraw: The sender should be the _approved or the agent'
      );

      await tryCatchRevert(
        () => tokenEscrow.withdrawToDepositant(
          escrowId,
          { from: creator }
        ),
        '_withdraw: The sender should be the _approved or the agent'
      );
    });
  });
  describe('Function cancel', function () {
    it('Cancel an escrow', async () => {
      const escrowId = await createBasicEscrow();
      await deposit(escrowId);

      const Cancel = await toEvents(
        tokenEscrow.cancel(
          escrowId,
          { from: agent }
        ),
        'Cancel'
      );

      assert.equal(Cancel._escrowId, escrowId);

      const escrow = await tokenEscrow.escrows(escrowId);
      assert.equal(escrow.depositant, address0x);
      assert.equal(escrow.retreader, address0x);
      assert.equal(escrow.agent, address0x);
      expect(escrow.fee).to.eq.BN(0);
      assert.equal(escrow.token, address0x);

      assert.equal(await erc721.ownerOf(basicEscrow.tokenId), depositant);
    });
    it('Try cancel without be the agent', async () => {
      const escrowId = await createBasicEscrow();

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
