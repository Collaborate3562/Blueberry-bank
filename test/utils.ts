import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber } from "ethers";
import { ethers } from 'hardhat';
import {
  IERC20Ex,
} from '../typechain-types';
import { CONTRACT_NAMES, ADDRESS } from "../constants"

export const almostEqual = (
	a: number,
	b: number,
	threshold = 0.01
) => {
	return a <= (b + threshold * Math.abs(b)) && a >= (b - threshold * Math.abs(b))
}

export const mint_tokens = async (
	token: IERC20Ex,
	alice: SignerWithAddress,
	amount = 0
) => {
  let _amount: BigNumber;
	if(amount === 0) {
    const decimal = await token.decimals();
    _amount = BigNumber.from(10).pow(12).mul(BigNumber.from(10).pow(decimal));
  } else {
    _amount = BigNumber.from(amount);
  }

  if(token.address === ADDRESS.ALPHA) {
    const ownerAddr = await token.owner();
    const signer = await ethers.getImpersonatedSigner(ownerAddr);
    await alice.sendTransaction({
      to: ownerAddr,
      value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
    });
    await token.connect(signer)['mint(uint256)'](_amount);
    await token.connect(signer).transfer(alice.address, _amount);
  } else if(token.address === ADDRESS.DAI) {
    const ownerAddr = await token.owner();
    const signer = await ethers.getImpersonatedSigner(ownerAddr);
    await alice.sendTransaction({
      to: ownerAddr,
      value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
    });
    await token.connect(signer)['mint(address,uint256)'](alice.address, amount);
  } else if(token.address === ADDRESS.WETH) {
  } else if(await token.symbol() === 'BPT') {
    const tokens = await token.getFinalTokens();
    const max_amts: BigNumber[] = [];
    let amt_desired = BigNumber.from(10).pow(100);
    for(const _token of tokens) {
      const _tokencontract = <IERC20Ex>await ethers.getContractAt(CONTRACT_NAMES.IERC20Ex, _token);
      const decimal = await _tokencontract.decimals();
      const amt = BigNumber.from(10).pow(12).mul(BigNumber.from(10).pow(decimal));
      await mint_tokens(_tokencontract, alice, amt.toNumber());
      await _tokencontract.connect(alice).approve(token.address, 0);
      await _tokencontract.connect(alice).approve(token.address, ethers.constants.MaxUint256);
      max_amts.push(amt);
      const supply = await token.totalSupply();
      amt_desired = amt_desired > amt.mul(supply) ? amt.mul(supply) : amt_desired;
    }
    await token.connect(alice).joinPool(amt_desired.mul(BigNumber.from(9)).div(BigNumber.from(10)), max_amts);
  }
}