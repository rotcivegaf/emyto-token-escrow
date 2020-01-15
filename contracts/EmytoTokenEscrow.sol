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
        IERC20 token;
        uint256 balance;
    }

    uint256 feeToEmyto;
    mapping(bytes32 => Escrow) public escrows;

    constructor(uint256 _feeToEmyto) public {
        feeToEmyto = _feeToEmyto;
    }

    function CreateEscrow(
        address _buyer,
        address _seller,
        address _agent,
        IERC20 _token,
        uint256 _fee
    ) external returns (uint256 id) {
        escrows[_betId] = Escrow({
            buyer: _buyer,
            seller: _seller,
            agent: _agent,
            token: _token,
            balance: 0
        });
    }
}
