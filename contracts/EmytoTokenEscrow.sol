pragma solidity ^0.5.11;

import "./utils/Ownable.sol";
import "./utils/SafeERC20.sol";
import "./utils/SafeMath.sol";

import "./interfaces/IERC20.sol";


/**
    @title Emyto token escrow
    @author Victor Fage <victorfage@gmail.com>
*/
contract EmytoTokenEscrow is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    // Events

    event CreateEscrow(
        bytes32 _escrowId,
        address _agent,
        address _depositant,
        address _retreader,
        uint256 _fee,
        IERC20 _token,
        uint256 _salt
    );

    event SignedCreateEscrow(bytes32 _escrowId, bytes _agentSignature);

    event CancelSignature(bytes32 _escrowId);

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
        address agent;
        address depositant;
        address retreader;
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
    mapping(address => uint256) public ownerBalances;
    mapping(bytes32 => Escrow) public escrows;

    mapping(bytes32 => bool) public canceledSignatures;

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

    // View functions

    /**
        @notice Calculate the escrow id

        @dev The id of the escrow its generate with keccak256 function using the parameters of the function

        @param _agent The agent address
        @param _depositant The depositant address
        @param _retreader The retreader address
        @param _fee The fee percentage(calculate in BASE), this fee will sent to the agent when the escrow is withdrawn
        @param _token The token address
        @param _salt An entropy value, used to generate the id

        @return The id of the escrow
    */
    function calculateId(
        address _agent,
        address _depositant,
        address _retreader,
        uint256 _fee,
        IERC20 _token,
        uint256 _salt
    ) public view returns(bytes32) {
        return keccak256(
            abi.encodePacked(
                address(this),
                _agent,
                _depositant,
                _retreader,
                _fee,
                _token,
                _salt
            )
        );
    }

    // External functions

    /**
        @notice Create an escrow, previous need the approve of the ERC20 tokens
            Fee: The ratio is expressed in order of BASE, for example
                1% is 100
                50.00% is 5000
                23.45% is 2345

        @dev The id of the escrow its generate with keccak256 function,
            using the address of this contract, the _depositant, the _retreader,
            the sender, the _token and the salt number

            The agent will be the sender of the transaction
            The _fee should be low or equal than 1000(10%)

        @param _depositant The depositant address
        @param _retreader The retrea    der address
        @param _fee The fee percentage(calculate in BASE), this fee will sent to the agent when the escrow is withdrawn
        @param _token The token address
        @param _salt An entropy value, used to generate the id

        @return The id of the escrow
    */
    function createEscrow(
        address _depositant,
        address _retreader,
        uint256 _fee,
        IERC20 _token,
        uint256 _salt
    ) external returns(bytes32 escrowId) {
        escrowId = _createEscrow(
            msg.sender,
            _depositant,
            _retreader,
            _fee,
            _token,
            _salt
        );
    }

    /**
        @notice Create an escrow, using the signature provided by the agent

        @dev The signature can will be cancel with cancelSignature function

        @param _agent The agent address
        @param _depositant The depositant address
        @param _retreader The retrea    der address
        @param _fee The fee percentage(calculate in BASE), this fee will sent to the agent when the escrow is withdrawn
        @param _token The token address
        @param _salt An entropy value, used to generate the id
        @param _agentSignature The signature provided by the agent

        @return The id of the escrow
    */
    function signedCreateEscrow(
        address _agent,
        address _depositant,
        address _retreader,
        uint256 _fee,
        IERC20 _token,
        uint256 _salt,
        bytes calldata _agentSignature
    ) external returns(bytes32 escrowId) {
        escrowId = _createEscrow(
            _agent,
            _depositant,
            _retreader,
            _fee,
            _token,
            _salt
        );

        require(!canceledSignatures[escrowId], "signedCreateEscrow: The signature was canceled");

        require(
            _agent == _ecrecovery(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", escrowId)), _agentSignature),
            "signedCreateEscrow: Invalid agent signature"
        );

        emit SignedCreateEscrow(escrowId, _agentSignature);
    }

    /**
        @notice Cancel a create escrow signature

        @dev The escrow id of the signature should be not exist

        @param _depositant The depositant address
        @param _retreader The retrea    der address
        @param _fee The fee percentage(calculate in BASE), this fee will sent to the agent when the escrow is withdrawn
        @param _token The token address
        @param _salt An entropy value, used to generate the id
    */
    function cancelSignature(
        address _depositant,
        address _retreader,
        uint256 _fee,
        IERC20 _token,
        uint256 _salt
    ) external {
        // Calculate the escrow id
        bytes32 escrowId = calculateId(
            msg.sender,
            _depositant,
            _retreader,
            _fee,
            _token,
            _salt
        );

        // Check if the escrow was created
        require(escrows[escrowId].agent == address(0), "cancelSignature: The escrow exists");

        canceledSignatures[escrowId] = true;

        emit CancelSignature(escrowId);
    }

    /**
        @notice Deposit an amount valuate in escrow token to an escrow

        @dev The depositant of the escrow should be the sender

        @param _escrowId The id of the escrow
        @param _amount The amount to deposit in an escrow, with owner fee
    */
    function deposit(bytes32 _escrowId, uint256 _amount) external {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == escrow.depositant, "deposit: The sender should be the depositant");

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
    function withdrawToRetreader(bytes32 _escrowId, uint256 _amount) external {
        Escrow storage escrow = escrows[_escrowId];
        _withdraw(_escrowId, escrow.depositant, escrow.retreader, _amount);
    }

    /**
        @notice Withdraw an amount from an escrow and the tokens  send to the depositant address

        @dev The sender should be the retreader or the agent of the escrow

        @param _escrowId The id of the escrow
        @param _amount The base amount
    */
    function withdrawToDepositant(bytes32 _escrowId, uint256 _amount) external {
        Escrow storage escrow = escrows[_escrowId];
        _withdraw(_escrowId, escrow.retreader, escrow.depositant, _amount);
    }

    /**
        @notice Cancel an escrow and send the balance of the escrow to the depositant address

        @dev The sender should be the agent of the escrow
            The escrow will deleted

        @param _escrowId The id of the escrow
    */
    function cancel(bytes32 _escrowId) external {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == escrow.agent, "cancel: The sender should be the agent");

        uint256 balance = escrow.balance;
        address depositant = escrow.depositant;
        IERC20 token = escrow.token;

        // Delete escrow
        delete escrows[_escrowId];

        // Send the tokens to the depositant if the escrow have balance
        if (balance != 0)
            require(
                token.safeTransfer(depositant, balance),
                "cancel: Error transfer to the depositant"
            );

        emit Cancel(_escrowId, balance);
    }

    // Internal functions

    function _createEscrow(
        address _agent,
        address _depositant,
        address _retreader,
        uint256 _fee,
        IERC20 _token,
        uint256 _salt
    ) internal returns(bytes32 escrowId) {
        require(_fee <= MAX_AGENT_FEE, "createEscrow: The agent fee should be low or equal than 1000");

        // Calculate the escrow id
        escrowId = calculateId(
            _agent,
            _depositant,
            _retreader,
            _fee,
            _token,
            _salt
        );

        // Check if the escrow was created
        require(escrows[escrowId].agent == address(0), "createEscrow: The escrow exists");

        // Add escrow to the escrows array
        escrows[escrowId] = Escrow({
            agent: _agent,
            depositant: _depositant,
            retreader: _retreader,
            fee: _fee,
            token: _token,
            balance: 0
        });

        emit CreateEscrow(escrowId, _agent, _depositant, _retreader, _fee, _token, _salt);
    }

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
        address _approved,
        address _to,
        uint256 _amount
    ) internal {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == _approved || msg.sender == escrow.agent, "_withdraw: The sender should be the _approved or the agent");

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

    function _ecrecovery(bytes32 _hash, bytes memory _sig) internal pure returns (address) {
        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(_sig, 32))
            s := mload(add(_sig, 64))
            v := and(mload(add(_sig, 65)), 255)
        }

        if (v < 27) {
            v += 27;
        }

        return ecrecover(_hash, v, r, s);
    }
}
