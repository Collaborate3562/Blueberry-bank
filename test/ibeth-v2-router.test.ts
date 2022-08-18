import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai, { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { CONTRACT_NAMES, ADDRESS } from "../constants"
import {
  IERC20Ex,
  IUniswapV2Pair,
  IUniswapV2Router02,
  IbETHRouterV2,
  SafeBoxETH
} from '../typechain-types';
import { setupBasic } from './helpers/setup-basic';
import { solidity } from 'ethereum-waffle'
import { near } from './assertions/near'
import { roughlyNear } from './assertions/roughlyNear'
import { mint_tokens } from './utils';

chai.use(solidity)
chai.use(near)
chai.use(roughlyNear)

describe('IBETHRouter', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let eve: SignerWithAddress;

  let alpha: IERC20Ex;

  let ibethv2: SafeBoxETH;
  let uniPair: IUniswapV2Pair;
  let sushiRoute: IUniswapV2Router02;
  let ibethv2_router: IbETHRouterV2;

  let prevIbethv2Bal: BigNumber;
  let curIbethv2Bal: BigNumber;
  let lp_amt: BigNumber;
  let eth_amt: BigNumber;
  let alpha_amt: BigNumber;
  let ibethv2_amt: BigNumber;
  let prevETHBal: BigNumber;
  let curETHBal: BigNumber;
  let prevAlphaBal: BigNumber;
  let curAlphaBal: BigNumber;
  let prevLPBal: BigNumber;
  let curLPBal: BigNumber;
  let prevLPSupply: BigNumber;
  let reserve: any;
  let newReserve: any;
  before(async () => {
    [admin, alice, bob, eve] = await ethers.getSigners();
    
    alpha = <IERC20Ex>await ethers.getContractAt(CONTRACT_NAMES.IERC20Ex, ADDRESS.ALPHA);
    ibethv2 = <SafeBoxETH>await ethers.getContractAt(CONTRACT_NAMES.SafeBoxETH, ADDRESS.IBETHV2);
    uniPair = <IUniswapV2Pair>await ethers.getContractAt(CONTRACT_NAMES.IUniswapV2Pair, ADDRESS.UNI_V2_PAIR);
    sushiRoute = <IUniswapV2Router02>await ethers.getContractAt(CONTRACT_NAMES.IUniswapV2Router02, ADDRESS.SUSHI_ROUTER);

    mint_tokens(alpha, alice);
    mint_tokens(alpha, admin);

    await ibethv2.connect(alice).deposit({ 'value': ethers.utils.parseEther('100') });
    await ibethv2.connect(admin).deposit({ 'value': ethers.utils.parseEther('100') });

    const IbETHRouteV2 = await ethers.getContractFactory(CONTRACT_NAMES.IbETHRouterV2);
    ibethv2_router = <IbETHRouterV2>await IbETHRouteV2.deploy(alpha.address, ibethv2.address, ADDRESS.SUSHI_ROUTER);
    await ibethv2_router.deployed();
  })

  describe('Basic', async () => {
    it('test', async () => {
      await alpha.connect(alice).approve(ibethv2_router.address, ethers.constants.MaxUint256);
      await ibethv2.connect(alice).approve(ibethv2_router.address, ethers.constants.MaxUint256);
      await uniPair.connect(alice).approve(ibethv2_router.address, ethers.constants.MaxUint256);

      const alphaDeciaml = await alpha.decimals();
      const ibethDeciaml = await ibethv2.decimals();

      const init_alpha_amt = BigNumber.from(10).pow(2).mul(BigNumber.from(10).pow(alphaDeciaml));
      const init_ibethv2_amt = BigNumber.from(10).pow(ibethDeciaml);

      await ibethv2.connect(admin).transfer(uniPair.address, init_ibethv2_amt);
      await alpha.connect(admin).transfer(uniPair.address, init_alpha_amt);

      uniPair.connect(admin).mint(admin.address);

      prevIbethv2Bal = await ibethv2.balanceOf(admin.address);
      await ibethv2.connect(admin).deposit({ 'value': ethers.utils.parseEther('1') });

      curIbethv2Bal = await ibethv2.balanceOf(admin.address);
      const ibethv2_eth_rate = BigNumber.from(10).pow(18).div(curIbethv2Bal.sub(prevIbethv2Bal));

      // console.log('conversion rate', ibethv2_eth_rate);
      // console.log('init ibethv2 amt', init_ibethv2_amt.mul(ibethv2_eth_rate));
      // console.log('deposited', 10**18, 'ether')
      // console.log('received', curIbethv2Bal.sub(prevIbethv2Bal), 'ibethv2');
      
      expect(await ibethv2_router.alpha()).to.be.equal(alpha.address);
      expect(await ibethv2_router.ibETHv2()).to.be.equal(ibethv2.address);
      expect(await ibethv2_router.lpToken()).to.be.equal(uniPair.address);
      expect(await ibethv2_router.router()).to.be.equal(sushiRoute.address);

      // console.log('===========================================');
      // console.log('Case. test swap exact eth to alpha');

      eth_amt = BigNumber.from(10).pow(12);

      prevETHBal = await alice.getBalance();
      prevAlphaBal = await alpha.balanceOf(alice.address);

      await ibethv2_router.connect(alice).swapExactETHToAlpha(
        0, alice.address, ethers.constants.MaxUint256, { 'value': eth_amt });

      curETHBal = await alice.getBalance();
      curAlphaBal = await alpha.balanceOf(alice.address);

      // console.log('init_alpha_amt', init_alpha_amt);
      // console.log('init_ibethv2_amt', init_ibethv2_amt);

      // console.log('∆ alpha', curAlphaBal.sub(prevAlphaBal));
      // console.log('calc alpha', eth_amt.mul(init_alpha_amt.div(init_ibethv2_amt)).div(ibethv2_eth_rate).mul(BigNumber.from(997)).div(BigNumber.from(10).pow(3)));

      expect(curAlphaBal.sub(prevAlphaBal)).to.be.roughlyNear(
        eth_amt.mul(init_alpha_amt.div(init_ibethv2_amt)).div(ibethv2_eth_rate).mul(BigNumber.from(997)).div(BigNumber.from(10).pow(3))
      );

      // console.log('=========================================')
      // console.log('Case. test add liquidity eth alpha optimal')

      alpha_amt = BigNumber.from(10).pow(5).mul(BigNumber.from(10).pow(18));
      eth_amt = BigNumber.from(10).pow(3).mul(BigNumber.from(10).pow(18));

      prevETHBal = await alice.getBalance();
      prevAlphaBal = await alpha.balanceOf(alice.address);
      prevLPBal = await uniPair.balanceOf(alice.address);

      prevLPSupply = await uniPair.totalSupply();
      reserve = await uniPair.getReserves();

      await ibethv2_router.connect(alice).addLiquidityETHAlphaOptimal(
          alpha_amt, 0, alice.address, ethers.constants.MaxUint256, { 'value': eth_amt });

      curETHBal = await alice.getBalance();
      curAlphaBal = await alpha.balanceOf(alice.address);
      curLPBal = await uniPair.balanceOf(alice.address);

      newReserve = await uniPair.getReserves();

      // console.log('prev total lp supply', prevLPSupply)
      // console.log('prev reserves', reserve.reserve0, reserve.reserve1);
      // console.log('cur reserves', newReserve.reserve0, newReserve.reserve1)
      // console.log('∆ lp', curLPBal.sub(prevLPBal));

      expect(newReserve.reserve0).to.be.roughlyNear(
        reserve.reserve0.add(alpha_amt)
      );
      expect(newReserve.reserve1).to.be.roughlyNear(
        reserve.reserve1.add(eth_amt.div(ibethv2_eth_rate))
      );

      // console.log('=========================================')
      // console.log('Case. test add liquidity ibethv2 alpha optimal')

      alpha_amt = BigNumber.from(10).pow(5).mul(BigNumber.from(10).pow(18));
      ibethv2_amt = BigNumber.from(10).pow(3).mul(BigNumber.from(10).pow(5));

      prevETHBal = await alice.getBalance();
      prevIbethv2Bal = await ibethv2.balanceOf(alice.address);
      prevAlphaBal = await alpha.balanceOf(alice.address);
      prevLPBal = await uniPair.balanceOf(alice.address);

      prevLPSupply = await uniPair.totalSupply();
      reserve = await uniPair.getReserves();

      await ibethv2_router.connect(alice).addLiquidityIbETHv2AlphaOptimal(
          ibethv2_amt, alpha_amt, 0, alice.address, ethers.constants.MaxUint256);

      curETHBal = await alice.getBalance();
      curAlphaBal = await alpha.balanceOf(alice.address);
      curIbethv2Bal = await ibethv2.balanceOf(alice.address);
      curLPBal = await uniPair.balanceOf(alice.address);

      newReserve = await uniPair.getReserves();

      // console.log('prev total lp supply', prevLPSupply);
      // console.log('prev reserves', reserve.reserve0, reserve.reserve1);
      // console.log('cur reserves', newReserve.reserve0, newReserve.reserve1);
      // console.log('∆ lp', curLPBal.sub(prevLPBal));

      expect(newReserve.reserve0).to.be.roughlyNear(
        reserve.reserve0.add(alpha_amt)
      );
      expect(newReserve.reserve1).to.be.roughlyNear(
        reserve.reserve1.add(ibethv2_amt)
      );

      // console.log('===========================================')
      // console.log('Case. test remove liquidity eth alpha')

      lp_amt = await uniPair.balanceOf(alice.address); // 3

      prevETHBal = await alice.getBalance();
      prevIbethv2Bal = await ibethv2.balanceOf(alice.address);
      prevAlphaBal = await alpha.balanceOf(alice.address);
      prevLPBal = await uniPair.balanceOf(alice.address);

      prevLPSupply = await uniPair.totalSupply();

      reserve = await uniPair.getReserves();

      await ibethv2_router.connect(alice).removeLiquidityETHAlpha(lp_amt, 0, 0, alice.address, ethers.constants.MaxUint256);

      curETHBal = await alice.getBalance();
      curAlphaBal = await alpha.balanceOf(alice.address);
      curIbethv2Bal = await ibethv2.balanceOf(alice.address);
      curLPBal = await uniPair.balanceOf(alice.address);

      // console.log('∆ alpha', curAlphaBal.sub(prevAlphaBal));
      // console.log('∆ ibethv2', curIbethv2Bal.sub(prevIbethv2Bal));

      // console.log(lp_amt, prevLPSupply, reserve.reserve0);

      expect(curAlphaBal.sub(prevAlphaBal)).to.be.roughlyNear(
        lp_amt.mul(reserve.reserve0).div(prevLPSupply)
      );
      expect(curETHBal.sub(prevETHBal)).to.be.roughlyNear(
        lp_amt.mul(reserve.reserve1).mul(ibethv2_eth_rate).div(prevLPSupply)
      );
    })
  });
});