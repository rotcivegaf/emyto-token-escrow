pragma solidity ^0.5.11;

import "./utils/Ownable.sol";
import "./utils/SafeERC20.sol";
import "./utils/SafeMath.sol";

import "./interfaces/IERC20.sol";


contract EmytoTokenEscrow is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    event CreateEscrow(
        bytes32 _escrowId,
        address _depositant,
        address _retreader,
        address _agent,
        uint256 _fee,
        IERC20 _token,
        uint256 _salt
    );

    event ApproveEscrow(bytes32 _escrowId);

    event RemoveApproveEscrow(bytes32 _escrowId);

    event Deposit(
        bytes32 _escrowId,
        uint256 _toEscrow,
        uint256 _toOwner
    );

    event Withdraw(
        bytes32 _escrowId,
        address _sender,
        address _to,
        uint256 _toAmount,
        uint256 _toAgent
    );

    event Cancel(bytes32 _escrowId, uint256 _amount);

    event SetOwnerFee(uint256 _fee);

    event OwnerWithdraw(IERC20 _token, address _to, uint256 _amount);

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
    uint256 public BASE = 10000;
    uint256 public ownerFee;

    // Token to balance of owner
    mapping (address => uint256) public ownerBalances;
    mapping (bytes32 => Escrow) public escrows;
    mapping (bytes32 => bool) public approvedEscrows;

    // OnlyOwner functions

    function setOwnerFee(uint256 _ownerFee) external onlyOwner {
        require(_ownerFee <= 5000, "setOwnerFee: The owner fee should be low or equal than 5000");
        ownerFee = _ownerFee;

        emit SetOwnerFee(_ownerFee);
    }

    function ownerWithdraw(
        IERC20 _token,
        address _to,
        uint256 _amount
    ) external onlyOwner {
        require(_to != address(0), 'ownerWithdraw: The to address 0 its invalid');

        ownerBalances[address(_token)] = ownerBalances[address(_token)].sub(_amount);

        require(
            _token.safeTransfer(_to, _amount),
            "ownerWithdraw: Error transfer to the owner"
        );

        emit OwnerWithdraw(_token, _to, _amount);
    }

    // External functions

    function createEscrow(
        address _depositant,
        address _retreader,
        address _agent,
        uint256 _fee,
        IERC20 _token,
        uint256 _salt
    ) external returns(bytes32 escrowId) {
        require(_agent != address(0), "createEscrow: The escrow should be have an agent");
        require(_fee <= 1000, "createEscrow: The agent fee should be low or equal than 1000");

        escrowId = keccak256(
          abi.encodePacked(
            address(this),
            _depositant,
            _retreader,
            _agent,
            _salt
          )
        );

        require(escrows[escrowId].agent == address(0), "createEscrow: The escrow exists");

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

        emit CreateEscrow(escrowId, _depositant, _retreader, _agent, _fee, _token, _salt);
    }

    function approveEscrow(
        bytes32 _escrowId
    ) external {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == escrow.agent, "approveEscrow: The sender should be the agent of the escrow");
        approvedEscrows[_escrowId] = true;

        emit ApproveEscrow(_escrowId);
    }

    function removeApproveEscrow(
        bytes32 _escrowId
    ) external {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.agent == msg.sender, "removeApproveEscrow: The sender should be the agent of the escrow");
        require(escrow.balance == 0, "removeApproveEscrow: The escrow still have amount");

        approvedEscrows[_escrowId] = false;

        emit RemoveApproveEscrow(_escrowId);
    }

    function deposit(
      bytes32 _escrowId,
      uint256 _amount // Amount without fees
    ) external {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == escrow.depositant, "deposit: The sender should be the depositant");
        require(approvedEscrows[_escrowId], "deposit: The escrow its not approved by the agent");

        uint256 toOwner = _feeAmount(_amount, ownerFee);

        require(
            escrow.token.safeTransferFrom(msg.sender, address(this), _amount),
            "deposit: Error deposit tokens"
        );

        ownerBalances[address(escrow.token)] += toOwner;
        uint256 toEscrow = _amount.sub(toOwner);
        escrow.balance += toEscrow;

        emit Deposit(_escrowId, toEscrow, toOwner);
    }

    function withdrawToRetreader(
        bytes32 _escrowId,
        uint256 _amount
    ) external {
        Escrow storage escrow = escrows[_escrowId];
        _withdraw(_escrowId, escrow.depositant, escrow.retreader, _amount);
    }

    function withdrawToDepositant(
        bytes32 _escrowId,
        uint256 _amount
    ) external {
        Escrow storage escrow = escrows[_escrowId];
        _withdraw(_escrowId, escrow.retreader, escrow.depositant, _amount);
    }

    function cancel(
        bytes32 _escrowId
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

    // Internal functions

    function _withdraw(
        bytes32 _escrowId,
        address _from,
        address _to,
        uint256 _amount
    ) internal returns(uint256) {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == _from || msg.sender == escrow.agent, "_withdraw: Error wrong sender");

        uint256 toAgent = _feeAmount(_amount, escrow.fee);

        escrow.balance = escrow.balance.sub(_amount);

        require(
            escrow.token.safeTransfer(escrow.agent, toAgent),
            "_withdraw: Error transfer tokens to the agent"
        );

        uint256 toAmount = _amount.sub(toAgent);

        require(
            escrow.token.safeTransfer(_to, toAmount),
            "_withdraw: Error transfer to the _to"
        );

        emit Withdraw(_escrowId, msg.sender, _to, toAmount, toAgent);
    }

    function _feeAmount(
        uint256 _amount,
        uint256 _fee
    ) internal view returns(uint256) {
        return _amount.mul(_fee).div(BASE);
    }
}
