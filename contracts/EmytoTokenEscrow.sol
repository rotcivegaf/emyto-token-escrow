pragma solidity ^0.5.11;

import "./utils/ERC721Base.sol";
import "./utils/Ownable.sol";


contract EmytoTokenEscrow is ERC721Base, Ownable {
    constructor() public ERC721Base("Emyto Multi Token Escrows", "ETE") { }

}
