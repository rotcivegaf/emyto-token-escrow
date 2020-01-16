pragma solidity ^0.5.11;

import "./utils/Ownable.sol";
import "./utils/SafeERC20.sol";

import "./interfaces/IERC20.sol";


contract EmytoTokenEscrow is ERC721Base, Ownable {
    using SafeERC20 for IERC20;

    struct Escrow {
        address buyer;
        address seller;
        address agent;
        uint256 fee;
        IERC20 token;
        uint256 balance;
    }

    // 10000 ==  100%
    //   505 == 5.05%
    uint256 BASE = 10000;
    uint256 emytoFee;

    // [wallet, Token] to balance
    mapping (address => mapping (IERC20 => uint256)) public toBalance;
    mapping (bytes32 => Escrow) public escrows;

    constructor(uint256 _emytoFee) public {
        emytoFee = _emytoFee;
    }

    function createEscrow(
        address _buyer,
        address _seller,
        address _agent,
        uint256 _fee
        IERC20 _token,
    ) external returns (uint256 escrowId) {
        require(_token != IERC20(0), "createEscrow: The token should not be the address 0");
        require(_buyer != address(0), "createEscrow: The buyer should not be the address 0");
        require(_seller != address(0), "createEscrow: The seller should not be the address 0");
        require(_agent != address(0), "createEscrow: The agent should not be the address 0");

        escrows[escrowId] = Escrow({
            buyer: _buyer,
            seller: _seller,
            agent: _agent,
            fee: _fee,
            token: _token,
            balance: 0
        });
    }

    function deposit(
      uint256 _escrowId,
      uint256 _amountWithFee
    ) public {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == escrow.buyer || msg.sender == escrow.agent, "deposit: The sender should be the seller or the agent")

        require(
            escrow.token.safeTransferFrom(msg.sender, address(this), _amountWithFee),
            "deposit: Error pulling tokens, in deposit"
        );

        uint256 toEmyto = _amountWithFee.mul(BASE).mul(emytoFee).div(BASE); // TODO move to library
        uint256 toAgent = _amountWithFee.mul(BASE).mul(escrow.fee).div(BASE); // TODO move to library

        toBalance(owner, escrow.token) += toEmyto;
        toBalance(escrow.agent, escrow.token) += toAgent;
        escrow.balance += _amountWithFee - toEmyto - toAgent;
    }
}
