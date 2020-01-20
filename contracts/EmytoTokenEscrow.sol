pragma solidity ^0.5.11;

import "./utils/Ownable.sol";
import "./utils/SafeERC20.sol";
import "./utils/SafeMath.sol";

import "./interfaces/IERC20.sol";


contract EmytoTokenEscrow is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    event CreateEscrow(
        uint256 _escrowId,
        address _depositant,
        address _retreader,
        address _agent,
        uint256 _fee,
        IERC20 _token
    );

    event ApproveEscrow(uint256 _escrowId);

    event Deposit(
        uint256 _escrowId,
        address _sender,
        uint256 _amount,
        uint256 _toOwner
    );

    event Withdraw(
        uint256 _escrowId,
        address _sender,
        address _to,
        uint256 _toAmount,
        uint256 _toAgent
    );

    event Cancel(uint256 _escrowId, uint256 _amount);

    event OwnerWithdraw(IERC20 _token, uint256 _amount);

    struct Escrow {
        address depositant;
        address retreader;
        address agent;
        uint256 fee;
        IERC20 token;
        uint256 balance;
    }

    // 10000 ==  100%
    //   505 == 5.05%
    uint256 BASE = 10000;
    uint256 ownerFee;

    // [wallet, Token] to balance
    mapping (address => uint256) public ownerBalance;
    mapping (uint256 => Escrow) public escrows;
    mapping (uint256 => bool) public approvedEscrows;

    constructor(uint256 _ownerFee) public {
        ownerFee = _ownerFee;
    }

    function createEscrow(
        address _depositant,
        address _retreader,
        address _agent,
        uint256 _fee,
        IERC20 _token
    ) external returns(uint256 escrowId) {
        escrows[escrowId] = Escrow({
            depositant: _depositant,
            retreader: _retreader,
            agent: _agent,
            fee: _fee,
            token: _token,
            balance: 0
        });

        if (msg.sender == _agent)
            approvedEscrows[escrowId] = true;

        emit CreateEscrow(escrowId, _depositant, _retreader, _agent, _fee, _token);
    }

    function approveEscrow(
        uint256 _escrowId
    ) external {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == escrow.agent, "approveEscrow: The sender should be the agent of the excrow");
        approvedEscrows[_escrowId] = true;

        emit ApproveEscrow(_escrowId);
    }

    function deposit(
      uint256 _escrowId,
      uint256 _amount // Amount without fees
    ) external {
        require(approvedEscrows[_escrowId], "deposit: The escrow its not approved by the agent");
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == escrow.depositant || msg.sender == escrow.agent, "deposit: The sender should be the depositant or the agent");

        uint256 toOwner = _feeAmount(_amount, ownerFee);

        require(
            escrow.token.safeTransferFrom(msg.sender, address(this), _amount.add(toOwner)),
            "deposit: Error deposit tokens"
        );

        ownerBalance[address(escrow.token)] += toOwner;
        escrow.balance += _amount;

        emit Deposit(_escrowId, msg.sender, _amount, toOwner);
    }

    function withdrawToRetreader(
        uint256 _escrowId
    ) external {
        Escrow storage escrow = escrows[_escrowId];
        _withdraw(_escrowId, escrow.depositant, escrow.retreader);
    }

    function withdrawToDepositant(
        uint256 _escrowId
    ) external {
        Escrow storage escrow = escrows[_escrowId];
        _withdraw(_escrowId, escrow.retreader, escrow.depositant);
    }

    function cancel(
        uint256 _escrowId
    ) external {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == escrow.agent, "cancel: The sender should be the agent");

        uint256 balance = escrow.balance;
        delete (escrow.balance);
        approvedEscrows[_escrowId] = false;

        require(
            escrow.token.safeTransfer(escrow.depositant, balance),
            "cancel: Error transfer to the depositant"
        );

        emit Cancel(_escrowId, balance);
    }

    function ownerWithdraw(
        IERC20 _token
    ) external onlyOwner {
        uint256 balance = ownerBalance[address(_token)];
        require(
            _token.safeTransfer(_owner, balance),
            "ownerWithdraw: Error transfer to the owner"
        );

        emit OwnerWithdraw(_token, balance);
    }

    function _withdraw(
        uint256 _escrowId,
        address _from,
        address _to
    ) internal returns(uint256) {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == _from || msg.sender == escrow.agent, "_withdraw: Error wrong sender");

        uint256 balance = escrow.balance;
        uint256 toAgent = _feeAmount(balance, escrow.fee);
        uint256 toAmount = balance - toAgent;

        delete (escrow.balance);
        approvedEscrows[_escrowId] = false; // si se puede sacar de a pequenios montos, tendria que haber un if

        require(
            escrow.token.safeTransfer(escrow.agent, toAgent),
            "_withdraw: Error transfer tokens to the agent"
        );

        require(
            escrow.token.safeTransfer(_to, toAmount),
            "_withdraw: Error transfer to the _to"
        );

        emit Withdraw(_escrowId, _from, _to, toAmount, toAgent);
    }

    function _feeAmount(
        uint256 _amount,
        uint256 _fee
    ) internal view returns(uint256) {
        return _amount.mul(_fee).div(BASE);
    }
}
