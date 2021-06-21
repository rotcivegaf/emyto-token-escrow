pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";


contract TestERC721 is ERC721("test", "TST") {
    function mint(address _to, uint256 _tokenId) public returns (bool) {
        _mint(_to, _tokenId);
        return true;
    }
}
