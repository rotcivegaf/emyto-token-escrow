# Emyto Token Escrow

An escrow has 3 actors:

- The agent: He is responsible for the tie breaking in a dispute
- The depositant: Is responsible for depositing the guarantee, once deposited, send it to the retreader or wait for The retreader to return it
- The retreader: Is responsible for returning the deposited guarantee or waiting to receive it

Also haves:

- An unique identifier
- A commission for the agent once the guarantee is withdrawn
- An address that refers to the token to which the escrow is valued
- A balance that corresponds to the amount of tokens that the escrow has

Emyto discounts a 0.25% commission on each security deposit as a cost for the development of the contract and the platform

This commission can change varying from 0.5% to 0%, leaving its use free

This guarantee can be returned if the escrow has a token without intrinsic economic content, for example, representative of a mortgage, equity tokens, etc. that remain in the possession of Emyto, you can communicate via mail and retrieve them (in exchange for the value represented in another token)

The percentages of the contract are calculated on the basis of 10,000, which means that:

- 10000 corresponds to 100%
- 1 corresponds to 0.01%
- 12345 corresponds to 123.45%

## Addresses

| Net         | Name              | Address
|------------ |------------------ | -------
| ETH Mainnet | EmytoERC20Escrow  | [0x29a1914747eaa45877a422d7c734911c01bbb99e](https://etherscan.io/address/0x29a1914747eaa45877a422d7c734911c01bbb99e)
| ETH Mainnet | EmytoERC721Escrow | [0x8e659f43009b56CF1882dA9b787A0A85B01B4c1B](https://etherscan.io/address/0x8e659f43009b56cf1882da9b787a0a85b01b4c1b)
| Ropsten     | EmytoERC20Escrow  | [0xf32092b7c47e08e41220d8b5f727b96413e0a3e0](https://ropsten.etherscan.io/address/0xf32092b7c47e08e41220d8b5f727b96413e0a3e0)
| Ropsten     | EmytoERC721Escrow | [0xa1c1dd7e50686e2edfe8dcb921d8eda0ce242510](https://ropsten.etherscan.io/address/0xa1c1dd7e50686e2edfe8dcb921d8eda0ce242510)
| BSC         | EmytoERC20Escrow  | [0xddbc97e87eb04c670c6aed2aaa49c505cce326ad](https://bscscan.com/address/0xddbc97e87eb04c670c6aed2aaa49c505cce326ad)
| BSC         | EmytoERC721Escrow | [0x0a740bfea858eedcc84f900a3d28aae01a17c5fc](https://bscscan.com/address/0x0a740bfea858eedcc84f900a3d28aae01a17c5fc)
| Polygon     | EmytoERC20Escrow  | [0xf42bfadd0db306df1ce729237288fdf59c9faf4c](https://polygonscan.com/address/0xf42bfadd0db306df1ce729237288fdf59c9faf4c)
| Polygon     | EmytoERC721Escrow | [0x5f33350c95fbd117e4b4b162c5319a751b3ddb96](https://polygonscan.com/address/0x5f33350c95fbd117e4b4b162c5319a751b3ddb96)
| xDai        | EmytoERC20Escrow  | [0xeC7fF01AdD91374c26c8225a2332B692F2680944](https://blockscout.com/xdai/mainnet/address/0xeC7fF01AdD91374c26c8225a2332B692F2680944/transactions)
| xDai        | EmytoERC721Escrow | [0x30e2d7abFa192c5ea6F4944d600019DC92EB5745](https://blockscout.com/xdai/mainnet/address/0x30e2d7abFa192c5ea6F4944d600019DC92EB5745/transactions)

## Create an escrow

There are 2 types of functions:

### createEscrow(address _depositant, address _retreader, uint256 _fee, IERC20 _token, uint256 _salt)

Together with the signedCreateEscrow function it is the first step to create an escrow

Assign as escrow agent to whom this transaction is sent

Create an escrow with the parameters sent:

- The depositant
- The retreader
- The percentage of commission directed to the agent
- The token
- The salt that is a kind of pepper that is added to the function to calculate the escrow identifier

Once created, the escrow is assigned an identifier using the calculateId function

At most the agent of an escrow can ask for a 10% commission

### signedCreateEscrow(address _agent, address _depositant, address _retreader, uint256 _fee, IERC20 _token, uint256 _salt, bytes calldata _agentSignature)

Same as the createEscrow function, but it can be sent by another address

The agent can deliver your signature, authorizing another address to create the escrow by him

The agent can cancel this signature, as long as the escrow has not been created

In addition to create escrow parameters, you need:

- The agent address
- The signature of the agent

### cancelSignature(bytes calldata _agentSignature)

Cancel an agent signature, taking as parameters:

- The signature

## Deposit guarantee

To deposit the guarantee the escrow must have been created

Only The escrow depositant can send this transaction and must have previously approved the contract to handle the amount to deposit

### deposit(bytes32 _escrowId, uint256 _amount)

The deposit function is responsible for depositing the guarantee and takes as parameters:

- The escrow identifier
- The amount to be subtracted from the depositor to deposit it in the escrow, subtracting the commission from Emyto

When depositing the guarantee Emyto charges a commission that is assigned with the function setEmytoFee

The amount deposited will be deducted from this commission, which will result in the escrow with:

```
amountForEmyto = amountToSubstract * commissionEmyto
depositAmount = amountToSubstract - amountForEmyto
newBalance = prevBalance + depositAmount
```

With the commission valued in%, for example:

```
prevBalance = 1000 Token
amountToSubstract = 78837 Token
commissionEmyto = 0.05%

amountForEmyto = 78837 Token * 0.05 = 3941 Token
depositAmount = 78837 Token - 3941 Token = 74896 Token
newBalance = 1000 Token + 74896 Token = 75896 Token
```

\ * Remember that they are whole numbers and always rounded down

## Withdraw guarantee

Once the guarantee is deposited there are two ways, one that the guarantee is returned to the depositor and another that is sent The retreader

When withdrawing warranty the agent of the escrow charges a commission placed on the creation of the escrow, it should be remembered that the commission can be free (0)

The amount to be withdrawn will be deducted from this commission, with which the escrow will be left with:

```
amountForAgent = amountToWithdraw * escrowCommission
amountToWithdraw = amountToWithdraw + amountForAgent
newBalance = prevBalance - amountToWithdraw
```

With the commission valued in%, for example:

```
prevBalance = 100000 Token
amountToWithdraw = 78837 Token
escrowCommission = 0.05%

amountForAgent = 78837 Token * 0.05 = 3941 Token
amountToWithdraw = 78837 Token + 3941 Token = 74896 Token
newBalance = 100000 Token - 74896 Token = 75896 Token
```

\ * Remember that they are whole numbers and always rounded down

For this there are 2 functions:

### withdrawToRetreader(bytes32 _escrowId, uint256 _amount)

This function is responsible for sending the warranty to the retreader

It can be sent by the agent or the depositant of the escrow and takes as parameters:

- The escrow identifier
- The amount to send

### withdrawToDepositant(bytes32 _escrowId, uint256 _amount)

This function is responsible for returning the guarantee to the depositant.

It can be sent by the agent or the retreader of the escrow and takes as parameters:

- The deposit identifier
- The amount to be returned

## Cancel an escrow

Once created the escrow can be canceled

### cancel(bytes32 _escrowId)

Take the escrow identifier as a parameter

This transaction can only be sent by the agent of the escrow

Delete the escrow from the storage and send its balance to the depositant

## Funcions of owner

### setEmytoFee(uint256 _fee)

Assign the commission of Emyto and only Emyto can send this transaction

At most Emyto can ask for a 0.5% commission, and at least 0%

### emytoWithdraw(IERC20 _token, address _to, uint256 _amount)

Withdraw the accumulated funds obtained by Emyto and only Emyto can send this transaction

It has as parameters:

- The token address from which the withdrawal of funds will be made
- A destination address, where these funds will go
- The amount to be withdrawn

## Function to calculate the escrow identifier

It is a help function to calculate the id of a future or current escrow

### function calculateId(address _agent, address _depositant, address _retreader, uint256 _fee, IERC20 _token, uint256 _salt)

Take as parameters the same as the createEscrow function, adding:

- The agent address

This function creates an identifier using the keccak256 function, using as parameters of this:

- The escrow contract address
- The agent address
- The address of the depositor
- The address of the retreader
- The Commission
- The token address
- The salt

## Running the tests

This project uses Truffle for tests. Truffle's version of `solc` needs to be at least 0.5.11 for the contracts to compile.
Open your console and run:

    $ git clone git@github.com:rotcivegaf/emyto-token-escrow.git
    $ cd emyto-token-escrow
    $ npm install

Now in one console, open the ganache-cli:

    $ ./node_modules/.bin/ganache-cli

And in other console(in the same folder), run the tests with truffle:

    $ ./node_modules/.bin/truffle test

## Authors

* **Victor Fage** - *Initial work* - [rotcivegaf](https://github.com/rotcivegaf)
