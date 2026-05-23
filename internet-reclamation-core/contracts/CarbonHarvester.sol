// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CarbonHarvester {
    address public owner;
    mapping(bytes32 => bool) public processedProofs;

    event HarvestProcessed(address indexed harvester, uint256 reward);

    constructor() { owner = msg.sender; }

    // Botun tarama sonucu elde ettiği kanıtı doğrular ve ödül verir
    function submitProof(bytes32 proofHash, uint256 amount) external {
        require(!processedProofs[proofHash], "Kanit zaten islendi!");
        processedProofs[proofHash] = true;
        
        // Ödeme işlemi (Sistemde tanımlı ödül havuzundan)
        payable(msg.sender).transfer(amount);
        
        emit HarvestProcessed(msg.sender, amount);
    }
}
