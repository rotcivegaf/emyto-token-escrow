pragma solidity ^0.5.11;

import "./utils/Ownable.sol";
import "./utils/SafeERC20.sol";
import "./utils/SafeMath.sol";

import "./interfaces/IERC20.sol";


contract EmytoTokenEscrow is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    // Events

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
    uint256 private MAX_OWNER_FEE = 5000;
    uint256 private MAX_AGENT_FEE = 1000;
    uint256 public ownerFee;

    // Token to balance of owner
    mapping (address => uint256) public ownerBalances;
    mapping (bytes32 => Escrow) public escrows;
    mapping (bytes32 => bool) public approvedEscrows;

    // OnlyOwner functions

    /**
        @notice Set the owner fee

        @dev Only the owner of the contract can send this transaction

        @param _ownerFee The new owner fee
    */
    function setOwnerFee(uint256 _ownerFee) external onlyOwner {
        require(_ownerFee <= MAX_OWNER_FEE, "setOwnerFee: The owner fee should be low or equal than the MAX_OWNER_FEE");
        ownerFee = _ownerFee;

        emit SetOwnerFee(_ownerFee);
    }

    /**
        @notice Withdraw the accumulated amount of the fee

        @dev Only the owner of the contract can send this transaction

        @param _token The address of the token to withdraw
        @param _to The address destination of the tokens
        @param _amount The amount to withdraw
    */
    function ownerWithdraw(
        IERC20 _token,
        address _to,
        uint256 _amount
    ) external onlyOwner {
        require(_to != address(0), "ownerWithdraw: The to address 0 its invalid");

        ownerBalances[address(_token)] = ownerBalances[address(_token)].sub(_amount);

        require(
            _token.safeTransfer(_to, _amount),
            "ownerWithdraw: Error transfer to the owner"
        );

        emit OwnerWithdraw(_token, _to, _amount);
    }

    // External functions

    /**
        @notice Create an escrow, previous need the approve of the ERC20 tokens
            Fee: The ratio is expressed in order of BASE, for example
                1% is 100
                50.00% is 5000
                23.45% is 2345

        @dev This generate an ERC721 and the id its generate with keccak256 function,
            using the addres of this contract, the _depositant, the _retreader,
            the _agent and the salt number

            The _agent should not be the address 0
            The _fee should be low or equal than 1000(10%)

        @param _depositant The depositant address
        @param _retreader The retreader address
        @param _agent The agent address
        @param _fee The fee percentage(calculate in BASE), this fee will sent to the agent when the escrow is withdrawn
        @param _token The token address
        @param _salt An entropy value, used to generate the id

        @return The id of the escrow
    */
    function createEscrow(
        address _depositant,
        address _retreader,
        address _agent,
        uint256 _fee,
        IERC20 _token,
        uint256 _salt
    ) external returns(bytes32 escrowId) {
        require(_agent != address(0), "createEscrow: The escrow should be have an agent");
        require(_fee <= MAX_AGENT_FEE, "createEscrow: The agent fee should be low or equal than 1000");

        // Calculate the escrow id
        escrowId = keccak256(
          abi.encodePacked(
            address(this),
            _depositant,
            _retreader,
            _agent,
            _salt
          )
        );

        // Check if the escrow was created
        require(escrows[escrowId].agent == address(0), "createEscrow: The escrow exists");

        // Add escrow to the escrows array
        escrows[escrowId] = Escrow({
            depositant: _depositant,
            retreader: _retreader,
            agent: _agent,
            fee: _fee,
            token: _token,
            balance: 0
        });

        // If the sender its the agent, the escrow its approve
        if (msg.sender == _agent)
            approvedEscrows[escrowId] = true;

        emit CreateEscrow(escrowId, _depositant, _retreader, _agent, _fee, _token, _salt);
    }

    /**
        @notice Used by the agent to approve an escrow

        @dev The agent of the escrow should be the sender

        @param _escrowId The id of the escrow
    */
    function approveEscrow(
        bytes32 _escrowId
    ) external {
        require(msg.sender == escrows[_escrowId].agent, "approveEscrow: The sender should be the agent of the escrow");

        approvedEscrows[_escrowId] = true;

        emit ApproveEscrow(_escrowId);
    }

    /**
        @notice Used by the agent to remove approve from an escrow

        @dev The agent of the escrow should be the sender

        @param _escrowId The id of the escrow
    */
    function removeApproveEscrow(
        bytes32 _escrowId
    ) external {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.agent == msg.sender, "removeApproveEscrow: The sender should be the agent of the escrow");
        require(escrow.balance == 0, "removeApproveEscrow: The escrow still have amount");

        approvedEscrows[_escrowId] = false;

        emit RemoveApproveEscrow(_escrowId);
    }

    /**
        @notice Deposit an amount valuate in escrow token to an escrow

        @dev The depositant of the escrow should be the sender
            The escrow should be approved

        @param _escrowId The id of the escrow
        @param _amount The amount to deposit in an escrow, with owner fee
    */
    function deposit(
      bytes32 _escrowId,
      uint256 _amount
    ) external {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == escrow.depositant, "deposit: The sender should be the depositant");
        require(approvedEscrows[_escrowId], "deposit: The escrow its not approved by the agent");

        uint256 toOwner = _feeAmount(_amount, ownerFee);

        // Transfer the tokens
        require(
            escrow.token.safeTransferFrom(msg.sender, address(this), _amount),
            "deposit: Error deposit tokens"
        );

        // Assign the fee amount to the owner
        ownerBalances[address(escrow.token)] += toOwner;
        // Assign the deposit amount to the escrow, subtracting the fee owner amount
        uint256 toEscrow = _amount.sub(toOwner);
        escrow.balance += toEscrow;

        emit Deposit(_escrowId, toEscrow, toOwner);
    }

    /**
        @notice Withdraw an amount from an escrow and send the tokens to the retreader address

        @dev The sender should be the depositant or the agent of the escrow

        @param _escrowId The id of the escrow
        @param _amount The base amount
    */
    function withdrawToRetreader(
        bytes32 _escrowId,
        uint256 _amount
    ) external {
        Escrow storage escrow = escrows[_escrowId];
        _withdraw(_escrowId, escrow.depositant, escrow.retreader, _amount);
    }

    /**
        @notice Withdraw an amount from an escrow and the tokens  send to the depositant address

        @dev The sender should be the retreader or the agent of the escrow

        @param _escrowId The id of the escrow
        @param _amount The base amount
    */
    function withdrawToDepositant(
        bytes32 _escrowId,
        uint256 _amount
    ) external {
        Escrow storage escrow = escrows[_escrowId];
        _withdraw(_escrowId, escrow.retreader, escrow.depositant, _amount);
    }

    /**
        @notice Cancel an escrow and send the balance of the escrow to the depositant address

        @dev The sender should be the agent of the escrow
            The escrow will deleted and remove the approbe

        @param _escrowId The id of the escrow
    */
    function cancel(
        bytes32 _escrowId
    ) external {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == escrow.agent, "cancel: The sender should be the agent");

        uint256 balance = escrow.balance;
        // Delete escrow
        delete (escrow.balance);
        // Remove approve escrow
        approvedEscrows[_escrowId] = false;

        // Send the tokens to the depositant if the escrow have balance
        if (balance != 0)
            require(
                escrow.token.safeTransfer(escrow.depositant, balance),
                "cancel: Error transfer to the depositant"
            );

        emit Cancel(_escrowId, balance);
    }

    // Internal functions

    /**
        @notice Withdraw an amount from an escrow and send to _to address

        @dev The sender should be the _approved or the agent of the escrow

        @param _escrowId The id of the escrow
        @param _approved The address of approved
        @param _to The address of gone the tokens
        @param _amount The base amount
    */
    function _withdraw(
        bytes32 _escrowId,
        address _from,
        address _to,
        uint256 _amount
    ) internal returns(uint256) {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == _from || msg.sender == escrow.agent, "_withdraw: Error wrong sender");

        // Calculate the fee
        uint256 toAgent = _feeAmount(_amount, escrow.fee);
        // Actualize escrow balance in storage
        escrow.balance = escrow.balance.sub(_amount);
        // Send fee to the agent
        require(
            escrow.token.safeTransfer(escrow.agent, toAgent),
            "_withdraw: Error transfer tokens to the agent"
        );
        // Substract the agent fee
        uint256 toAmount = _amount.sub(toAgent);
        // Send amount to the _to
        require(
            escrow.token.safeTransfer(_to, toAmount),
            "_withdraw: Error transfer to the _to"
        );

        emit Withdraw(_escrowId, msg.sender, _to, toAmount, toAgent);
    }

    /**
        @notice Calculate the fee amount

        @dev Formula: _amount * _fee / BASE

        @param _amount The base amount
        @param _fee The fee

        @return The calculate fee
    */
    function _feeAmount(
        uint256 _amount,
        uint256 _fee
    ) internal view returns(uint256) {
        return _amount.mul(_fee).div(BASE);
    }
}
