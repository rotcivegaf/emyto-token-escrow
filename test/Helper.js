const BN = web3.utils.BN;

const expect = require('chai')
  .use(require('bn-chai')(BN))
  .expect;

module.exports.expect = expect;

module.exports.bn = (number) => {
  return web3.utils.toBN(number);
};

module.exports.randombnBetween = (min, max) => {
  return this.bn(Math.floor(Math.random() * max) + min);
};

module.exports.maxUint = (base) => {
  return this.bn('2').pow(this.bn(base)).sub(this.bn('1'));
};

module.exports.random32bn = () => {
  return this.bn(this.random32());
};

module.exports.random32 = () => {
  return web3.utils.randomHex(32);
};

module.exports.sign = async (msg, signer) => {
  const signature = await web3.eth.sign(msg, signer);
  return signature.substr(0, 130) + (signature.substr(130) === '00' ? '1b' : '1c');
};
