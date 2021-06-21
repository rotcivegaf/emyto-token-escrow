pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


/**
    @title Emyto ERC20 escrow
    @author Victor Fage <victorfage@gmail.com>
*/
contract EmytoERC20Escrow is Ownable {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    // Events

    event CreateEscrow(
        bytes32 escrowId,
        address agent,
        address depositant,
        address retreader,
        uint256 fee,
        IERC20 token,
        uint256 salt
    );

    event SignedCreateEscrow(bytes32 escrowId, bytes agentSignature);

    event CancelSignature(bytes agentSignature);

    event Deposit(bytes32 escrowId, uint256 toEscrow, uint256 toEmyto);

    event Withdraw(
        bytes32 escrowId,
        address to,
        uint256 toAmount,
        uint256 toAgent
    );

    event Cancel(bytes32 escrowId, uint256 amount);

    event SetEmytoFee(uint256 fee);

    event EmytoWithdraw(IERC20 token, address to, uint256 amount);

    struct Escrow {
        address agent;
        address depositant;
        address retreader;
        IERC20 token;
        uint240 balance;
        uint16  fee;
    }

    // 10000 ==  100%
    //   505 == 5.05%
    uint256 public BASE = 10000;
    uint256 private MAX_EMYTO_FEE =   50; // 0.5%
    uint16  private MAX_AGENT_FEE = 1000; // 10%
    uint256 public emytoFee;

    // Token to balance of emyto
    mapping(address => uint256) public emytoBalances;
    mapping(bytes32 => Escrow) public escrows;

    mapping (address => mapping (bytes => bool)) public canceledSignatures;

    // OnlyOwner functions

    /**
        @notice Set the emyto fee

        @dev Only the owner of the contract can send this transaction

        @param _fee The new emyto fee
    */
    function setEmytoFee(uint256 _fee) external onlyOwner {
        require(_fee <= MAX_EMYTO_FEE, "EmytoERC20Escrow::setEmytoFee: The emyto fee should be low or equal than the MAX_EMYTO_FEE");
        emytoFee = _fee;

        emit SetEmytoFee(_fee);
    }

    /**
        @notice Withdraw the accumulated amount of the fee

        @dev Only the owner of the contract can send this transaction

        @param _token The address of the token to withdraw
        @param _to The address destination of the tokens
        @param _amount The amount to withdraw
    */
    function emytoWithdraw(IERC20 _token, address _to, uint256 _amount) external onlyOwner {
        require(_to != address(0), "EmytoERC20Escrow::emytoWithdraw: The to address 0 its invalid");

        emytoBalances[address(_token)] -= _amount;

        _token.safeTransfer(_to, _amount);

        emit EmytoWithdraw(_token, _to, _amount);
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

        @return escrowId The id of the escrow
    */
    function calculateId(
        address _agent,
        address _depositant,
        address _retreader,
        uint16 _fee,
        IERC20 _token,
        uint256 _salt
    ) public view returns(bytes32 escrowId) {
        escrowId = keccak256(
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
        @notice Create an ERC20 escrow
            Fee: The ratio is expressed in order of BASE, for example
                1% is 100
                50.00% is 5000
                23.45% is 2345

        @dev The id of the escrow its generate with keccak256 function,
            using the address of this contract, the sender(agent), the _depositant,
            the _retreader, the _fee, the _token and the salt number

            The agent will be the sender of the transaction
            The _fee should be low or equal than 1000(10%)

        @param _depositant The depositant address
        @param _retreader The retrea    der address
        @param _fee The fee percentage(calculate in BASE), this fee will sent to the agent when the escrow is withdrawn
        @param _token The token address
        @param _salt An entropy value, used to generate the id

        @return escrowId The id of the escrow
    */
    function createEscrow(
        address _depositant,
        address _retreader,
        uint16  _fee,
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

        @return escrowId The id of the escrow
    */
    function signedCreateEscrow(
        address _agent,
        address _depositant,
        address _retreader,
        uint16  _fee,
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

        require(!canceledSignatures[_agent][_agentSignature], "EmytoERC20Escrow::signedCreateEscrow: The signature was canceled");

        require(
            _agent == escrowId.toEthSignedMessageHash().recover(_agentSignature),
            "EmytoERC20Escrow::signedCreateEscrow: Invalid agent signature"
        );

        emit SignedCreateEscrow(escrowId, _agentSignature);
    }

    /**
        @notice Cancel a create escrow signature

        @param _agentSignature The signature provided by the agent
    */
    function cancelSignature(bytes calldata _agentSignature) external {
        canceledSignatures[msg.sender][_agentSignature] = true;

        emit CancelSignature(_agentSignature);
    }

    /**
        @notice Deposit an amount valuate in escrow token to an escrow

        @dev The depositant of the escrow should be the sender, previous need the approve of the ERC20 tokens

        @param _escrowId The id of the escrow
        @param _amount The amount to deposit in an escrow, with emyto fee amount
    */
    function deposit(bytes32 _escrowId, uint256 _amount) external {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == escrow.depositant, "EmytoERC20Escrow::deposit: The sender should be the depositant");

        uint256 toEmyto = _feeAmount(_amount, emytoFee);

        // Transfer the tokens
        escrow.token.safeTransferFrom(msg.sender, address(this), _amount);

        // Assign the fee amount to emyto
        emytoBalances[address(escrow.token)] += toEmyto;
        // Assign the deposit amount to the escrow, subtracting the fee emyto amount
        uint256 toEscrow = _amount - toEmyto;
        escrow.balance += uint240(toEscrow);

        emit Deposit(_escrowId, toEscrow, toEmyto);
    }

    /**
        @notice Withdraw an amount from an escrow and send the tokens to the retreader address

        @dev The sender should be the depositant or the agent of the escrow

        @param _escrowId The id of the escrow
        @param _amount The base amount
    */
    function withdrawToRetreader(bytes32 _escrowId, uint240 _amount) external {
        Escrow storage escrow = escrows[_escrowId];
        _withdraw(_escrowId, escrow.depositant, escrow.retreader, _amount);
    }

    /**
        @notice Withdraw an amount from an escrow and the tokens  send to the depositant address

        @dev The sender should be the retreader or the agent of the escrow

        @param _escrowId The id of the escrow
        @param _amount The base amount
    */
    function withdrawToDepositant(bytes32 _escrowId, uint240 _amount) external {
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
        require(msg.sender == escrow.agent, "EmytoERC20Escrow::cancel: The sender should be the agent");

        uint256 balance = escrow.balance;
        address depositant = escrow.depositant;
        IERC20 token = escrow.token;

        // Delete escrow
        delete escrows[_escrowId];

        // Send the tokens to the depositant if the escrow have balance
        if (balance != 0)
            token.safeTransfer(depositant, balance);

        emit Cancel(_escrowId, balance);
    }

    // Internal functions

    function _createEscrow(
        address _agent,
        address _depositant,
        address _retreader,
        uint16  _fee,
        IERC20 _token,
        uint256 _salt
    ) internal returns(bytes32 escrowId) {
        require(_fee <= MAX_AGENT_FEE, "EmytoERC20Escrow::createEscrow: The agent fee should be low or equal than 1000");

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
        require(escrows[escrowId].agent == address(0), "EmytoERC20Escrow::createEscrow: The escrow exists");

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
        uint240 _amount
    ) internal {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == _approved || msg.sender == escrow.agent, "EmytoERC20Escrow::_withdraw: The sender should be the _approved or the agent");

        // Calculate the fee
        uint256 toAgent = _feeAmount(_amount, uint256(escrow.fee));
        // Actualize escrow balance in storage
        escrow.balance -= _amount;
        // Send fee to the agent
        escrow.token.safeTransfer(escrow.agent, toAgent);
        // Substract the agent fee
        uint256 toAmount = _amount - toAgent;
        // Send amount to the _to
        escrow.token.safeTransfer(_to, toAmount);

        emit Withdraw(_escrowId, _to, toAmount, toAgent);
    }

    /**
        @notice Calculate the fee amount

        @dev Formula: _amount * _fee / BASE

        @param _amount The base amount
        @param _fee The fee

        @return The calculate fee
    */
    function _feeAmount(uint256 _amount, uint256 _fee) internal view returns(uint256) {
        return (_amount * _fee) / BASE;
    }
}
