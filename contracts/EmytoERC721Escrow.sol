pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";


/**
    @title Emyto ERC721 token escrow
    @author Victor Fage <victorfage@gmail.com>
*/
contract EmytoERC721Escrow {
    using ECDSA for bytes32;

    // Events

    event CreateEscrow(
        bytes32 escrowId,
        address agent,
        address depositant,
        address retreader,
        IERC721 token,
        uint256 tokenId,
        uint256 salt
    );

    event SignedCreateEscrow(bytes32 escrowId, bytes agentSignature);

    event CancelSignature(bytes agentSignature);

    event Deposit(bytes32 escrowId);

    event Withdraw(bytes32 escrowId, address to);

    event Cancel(bytes32 escrowId);

    struct Escrow {
        address agent;
        address depositant;
        address retreader;
        IERC721 token;
        uint256 tokenId;
    }

    mapping (bytes32 => Escrow) public escrows;
    mapping (address => mapping (bytes => bool)) public canceledSignatures;

    // View functions

    /**
        @notice Calculate the escrow id

        @dev The id of the escrow its generate with keccak256 function using the parameters of the function

        @param _agent The agent address
        @param _depositant The depositant address
        @param _retreader The retreader address
        @param _token The ERC721 token address
        @param _tokenId The ERC721 token id
        @param _salt An entropy value, used to generate the id

        @return escrowId The id of the escrow
    */
    function calculateId(
        address _agent,
        address _depositant,
        address _retreader,
        IERC721 _token,
        uint256 _tokenId,
        uint256 _salt
    ) public view returns(bytes32 escrowId) {
        escrowId = keccak256(
            abi.encodePacked(
                address(this),
                _agent,
                _depositant,
                _retreader,
                _token,
                _tokenId,
                _salt
            )
        );
    }

    // External functions

    /**
        @notice Create an ERC721 escrow

        @dev The id of the escrow its generate with keccak256 function,
            using the address of this contract, the sender(agent), the _depositant,
            the _retreader, the _token, the _tokenId and the salt number

            The agent will be the sender of the transaction

        @param _depositant The depositant address
        @param _retreader The retreader address
        @param _token The ERC721 token address
        @param _tokenId The ERC721 token id
        @param _salt An entropy value, used to generate the id

        @return escrowId The id of the escrow
    */
    function createEscrow(
        address _depositant,
        address _retreader,
        IERC721 _token,
        uint256 _tokenId,
        uint256 _salt
    ) external returns(bytes32 escrowId) {
        escrowId = _createEscrow(
            msg.sender,
            _depositant,
            _retreader,
            _token,
            _tokenId,
            _salt
        );
    }

    /**
        @notice Create an escrow, using the signature provided by the agent

        @dev The signature can will be cancel with cancelSignature function

        @param _agent The agent address
        @param _depositant The depositant address
        @param _retreader The retrea    der address
        @param _token The ERC721 token address
        @param _tokenId The ERC721 token id
        @param _salt An entropy value, used to generate the id
        @param _agentSignature The signature provided by the agent

        @return escrowId The id of the escrow
    */
    function signedCreateEscrow(
        address _agent,
        address _depositant,
        address _retreader,
        IERC721 _token,
        uint256 _tokenId,
        uint256 _salt,
        bytes calldata _agentSignature
    ) external returns(bytes32 escrowId) {
        escrowId = _createEscrow(
            _agent,
            _depositant,
            _retreader,
            _token,
            _tokenId,
            _salt
        );

        require(!canceledSignatures[_agent][_agentSignature], "EmytoERC721Escrow::signedCreateEscrow: The signature was canceled");

        require(
            _agent == escrowId.toEthSignedMessageHash().recover(_agentSignature),
            "EmytoERC721Escrow::signedCreateEscrow: Invalid agent signature"
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
        @notice Deposit an erc721 token in escrow

        @dev The depositant of the escrow should be the sender, previous need the approve of the ERC721 token

        @param _escrowId The id of the escrow
    */
    function deposit(bytes32 _escrowId) external {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == escrow.depositant, "EmytoERC721Escrow::deposit: The sender should be the depositant");

        // Transfer the erc721 token
        escrow.token.transferFrom(msg.sender, address(this), escrow.tokenId);

        emit Deposit(_escrowId);
    }

    /**
        @notice Withdraw an erc721 token from an escrow and send it to the retreader address

        @dev The sender should be the depositant or the agent of the escrow

        @param _escrowId The id of the escrow
    */
    function withdrawToRetreader(bytes32 _escrowId) external {
        Escrow storage escrow = escrows[_escrowId];
        _withdraw(_escrowId, escrow.depositant, escrow.retreader);
    }

    /**
        @notice Withdraw an erc721 token from an escrow and send it to the depositant address

        @dev The sender should be the retreader or the agent of the escrow

        @param _escrowId The id of the escrow
    */
    function withdrawToDepositant(bytes32 _escrowId) external {
        Escrow storage escrow = escrows[_escrowId];
        _withdraw(_escrowId, escrow.retreader, escrow.depositant);
    }

    /**
        @notice Cancel an escrow and send the erc721 token to the depositant address

        @dev The sender should be the agent of the escrow
            The escrow will deleted

        @param _escrowId The id of the escrow
    */
    function cancel(bytes32 _escrowId) external {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == escrow.agent, "EmytoERC721Escrow::cancel: The sender should be the agent");

        address depositant = escrow.depositant;
        IERC721 token = escrow.token;
        uint256 tokenId = escrow.tokenId;

        // Delete escrow
        delete escrows[_escrowId];

        // Send the ERC721 token to the depositant
        token.safeTransferFrom(address(this), depositant, tokenId);

        emit Cancel(_escrowId);
    }

    // Internal functions

    function _createEscrow(
        address _agent,
        address _depositant,
        address _retreader,
        IERC721 _token,
        uint256 _tokenId,
        uint256 _salt
    ) internal returns(bytes32 escrowId) {
        // Calculate the escrow id
        escrowId = calculateId(
            _agent,
            _depositant,
            _retreader,
            _token,
            _tokenId,
            _salt
        );

        // Check if the escrow was created
        require(escrows[escrowId].agent == address(0), "EmytoERC721Escrow::createEscrow: The escrow exists");

        // Add escrow to the escrows array
        escrows[escrowId] = Escrow({
            agent: _agent,
            depositant: _depositant,
            retreader: _retreader,
            token: _token,
            tokenId: _tokenId
        });

        emit CreateEscrow(escrowId, _agent, _depositant, _retreader, _token, _tokenId, _salt);
    }

    /**
        @notice Withdraw an erc721 token from an escrow and send it to _to address

        @dev The sender should be the _approved or the agent of the escrow

        @param _escrowId The id of the escrow
        @param _approved The address of approved
        @param _to The address of gone the tokens
    */
    function _withdraw(bytes32 _escrowId, address _approved, address _to) internal {
        Escrow storage escrow = escrows[_escrowId];
        require(msg.sender == _approved || msg.sender == escrow.agent, "EmytoERC721Escrow::_withdraw: The sender should be the _approved or the agent");

        escrow.token.safeTransferFrom(address(this), _to, escrow.tokenId);

        emit Withdraw(_escrowId, _to);
    }
}
