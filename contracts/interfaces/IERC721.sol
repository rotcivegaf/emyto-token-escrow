pragma solidity ^0.5.11;


contract IERC721 {
    // ERC20 compatible functions
    function name() public view returns (string memory _name);
    function symbol() public view returns (string memory _symbol);

    event Transfer(address indexed _from, address indexed _to, uint256 indexed _tokenId);
    event Approval(address indexed _owner, address indexed _approved, uint256 indexed _tokenId);
    event ApprovalForAll(address indexed _owner, address indexed _operator, bool _approved);

    function balanceOf(address owner) public view returns (uint256 balance);
    function ownerOf(uint256 tokenId) public view returns (address owner);
    function getApproved(uint256 tokenId) public view returns (address operator);
    function isApprovedForAll(address owner, address operator) public view returns (bool);

    function approve(address to, uint256 tokenId) public;
    function setApprovalForAll(address operator, bool _approved) public;

    function transferFrom(address from, address to, uint256 tokenId) public;
    function safeTransferFrom(address from, address to, uint256 tokenId) public;
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public;
}
