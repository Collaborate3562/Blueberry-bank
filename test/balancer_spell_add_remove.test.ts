import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai, { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { CONTRACT_NAMES, ADDRESS } from "../constants"
import {
  BalancerPairOracle,
  BalancerSpellV1,
  BlueBerryBank,
  CoreOracle,
  ERC20,
  ICErc20,
  ICEtherEx,
  IComptroller,
  IERC20Ex,
  IBalancerPool,
  MockWETH,
  ProxyOracle,
  SimpleOracle,
  WERC20,
  MockERC20,
} from '../typechain-types';
import { setupBasic } from './helpers/setup-basic';
import { solidity } from 'ethereum-waffle'
import { near } from './assertions/near'
import { roughlyNear } from './assertions/roughlyNear'
import { mint_tokens } from './utils';
import SpellArtifact from '../artifacts/contracts/spell/BalancerSpellV1.sol/BalancerSpellV1.json';

chai.use(solidity)
chai.use(near)
chai.use(roughlyNear)

describe('Balancer Spell add remove', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let eve: SignerWithAddress;

  let alpha: IERC20Ex;

  let controller: IComptroller;
  let coreOracle: CoreOracle;
  let creth: ICEtherEx;
  let balancerOralce: BalancerPairOracle;
  let balancer_spell: BalancerSpellV1;
  let blueberryBank: BlueBerryBank;
  let dai: MockERC20;
  let oracle: ProxyOracle;
  let simpleOracle: SimpleOracle;
  let werc20: WERC20;
  let weth: MockWETH;
  let prevABal: BigNumber;
  let prevBBal: BigNumber;
  let prevLPBal: BigNumber;
  let prevLPBal_bank: BigNumber;
  let prevLPBal_werc20: BigNumber;
  let prevARes: BigNumber;
  let prevBRes: BigNumber;
  let curABal: BigNumber;
  let curBBal: BigNumber;
  let curLPBal: BigNumber;
  let curLPBal_bank: BigNumber;
  let curLPBal_werc20: BigNumber;

  // const setup_bank_hack = async (
  //   blueberry: BlueBerryBank
  // ) => {
  //   const signers = await ethers.getSigners();
  //   const donator = signers[5];
  //   const fake = await ethers.getSigner(blueberry.address);
    
  //   controller = <IComptroller>await ethers.getContractAt(CONTRACT_NAMES.IComptroller, ADDRESS.Comptroller);
  //   creth = <ICEtherEx>await ethers.getContractAt(CONTRACT_NAMES.ICEtherEx, ADDRESS.crETH);
  //   creth.connect(donator)['mint()']({ 'value': ethers.utils.parseEther('100') });
  //   creth.connect(donator).transfer(fake.address, creth.balanceOf(donator.address));
  //   controller.connect(fake.address).enterMarkets([creth.address]);
  // }

  before(async () => {
    [admin, alice, bob, eve] = await ethers.getSigners();

    const WERC20 = await ethers.getContractFactory(CONTRACT_NAMES.WERC20);
    werc20 = <WERC20>await WERC20.deploy();
    await werc20.deployed();

    const MockWETH = await ethers.getContractFactory(CONTRACT_NAMES.MockWETH);
    weth = <MockWETH>await MockWETH.deploy();
    await weth.deployed();

    const MockERC20 = await ethers.getContractFactory(CONTRACT_NAMES.MockERC20);
    dai = <MockERC20>await MockERC20.deploy('DAI', 'DAI', 6);
    await dai.deployed();

    const SimpleOracle = await ethers.getContractFactory(CONTRACT_NAMES.SimpleOracle);
    simpleOracle = <SimpleOracle>await SimpleOracle.deploy();
    await simpleOracle.deployed();
    await simpleOracle.setETHPx(
      [
        weth.address,
        dai.address,
        ADDRESS.BAL_WETH_DAI_8020
      ],
      [
        BigNumber.from(2).pow(112),
        BigNumber.from(2).pow(112).div(600),
        BigNumber.from(2).pow(112).div(600)
      ],
    )

    const BalancerPairOracle = await ethers.getContractFactory(CONTRACT_NAMES.BalancerPairOracle);
    balancerOralce = <BalancerPairOracle>await BalancerPairOracle.connect(alice).deploy(simpleOracle.address);
    await balancerOralce.deployed();

    const CoreOralce = await ethers.getContractFactory(CONTRACT_NAMES.CoreOracle);
    coreOracle = <CoreOracle>await CoreOralce.deploy();
    await coreOracle.deployed();

    const ProxyOracle = await ethers.getContractFactory(CONTRACT_NAMES.ProxyOracle);
    oracle = <ProxyOracle>await ProxyOracle.deploy(coreOracle.address);
    await oracle.deployed();

    await oracle.connect(admin).setWhitelistERC1155([werc20.address], true);

    coreOracle.connect(admin).setRoute(
      [
        weth.address,
        dai.address,
        ADDRESS.BAL_WETH_DAI_8020
      ],
      [
        simpleOracle.address, 
        simpleOracle.address, 
        simpleOracle.address
      ]
    );

    oracle.connect(admin).setTokenFactors(
      [
        weth.address,
        dai.address,
        ADDRESS.BAL_WETH_DAI_8020
      ],
      [
        {
          borrowFactor: 10000,
          collateralFactor: 10000,
          liqIncentive: 10000,
        }, {
          borrowFactor: 10000,
          collateralFactor: 10000,
          liqIncentive: 10000,
        }, {
          borrowFactor: 10000,
          collateralFactor: 10000,
          liqIncentive: 10000,
        },
      ]
    );

    const BlueBerryBank = await ethers.getContractFactory(CONTRACT_NAMES.BlueBerryBank);
    blueberryBank = <BlueBerryBank>await BlueBerryBank.deploy();
    await blueberryBank.deployed();

    await blueberryBank.connect(admin).initialize(oracle.address, 1000);
    await blueberryBank.connect(admin).addBank(dai.address, ADDRESS.crDAI);

    const BalancerSpellV1 = await ethers.getContractFactory(CONTRACT_NAMES.BalancerSpellV1);
    balancer_spell = <BalancerSpellV1>await BalancerSpellV1.deploy(blueberryBank.address, werc20.address, weth.address);
    await balancerOralce.deployed();
  })

  describe('Basic', async () => {
    it('test', async () => {
      await dai.connect(admin).mint(alice.address, BigNumber.from(10).pow(12).mul(BigNumber.from(10).pow(6)));
      await weth.connect(alice).deposit({ 'value': BigNumber.from(10).pow(1).mul(BigNumber.from(10).pow(18)) });

      const lp = <ERC20>await ethers.getContractAt(CONTRACT_NAMES.ERC20, ADDRESS.BAL_WETH_DAI_8020);
      const pool = <IBalancerPool>await ethers.getContractAt(CONTRACT_NAMES.IBalancerPool, ADDRESS.BAL_WETH_DAI_8020); // pool is lp for balancer
      const crdai = <ICErc20>await ethers.getContractAt(CONTRACT_NAMES.ICErc20, ADDRESS.crDAI);

      // set approval
      await dai.connect(alice).approve(blueberryBank.address, ethers.constants.MaxUint256);
      await dai.connect(alice).approve(crdai.address, ethers.constants.MaxUint256);
      await weth.connect(alice).approve(blueberryBank.address, ethers.constants.MaxUint256);
      await lp.connect(alice).approve(blueberryBank.address, ethers.constants.MaxUint256);

      // first time call to reduce gas
      await balancer_spell.getAndApprovePair(lp.address);

      // whitelist spell in bank
      await blueberryBank.connect(admin).setWhitelistSpells([balancer_spell.address, lp.address], [true, true]);

      // whitelist lp in spell
      await balancer_spell.connect(admin).setWhitelistLPTokens([lp.address], [true]);

      prevABal = await dai.balanceOf(alice.address);
      prevBBal = await weth.balanceOf(alice.address);
      prevLPBal = await lp.balanceOf(alice.address);
      prevLPBal_bank = await lp.balanceOf(blueberryBank.address);
      prevLPBal_werc20 = await lp.balanceOf(werc20.address);
      
      const dai_amt = BigNumber.from(10).pow(4).mul(4).mul(BigNumber.from(10).pow(6));
      const weth_amt = BigNumber.from(10).pow(6);
      const lp_amt = BigNumber.from(10).pow(6);
      const borrow_dai_amt = 0;
      const borrow_weth_amt = 0;

      // calculate slippage control
      const total_dai_amt = dai_amt.add(borrow_dai_amt);
      const total_weth_amt = weth_amt.add(borrow_weth_amt);
      const dai_weight = 0.2;
      const weth_weight = 0.8;

      const iface = new ethers.utils.Interface(SpellArtifact.abi);
      await blueberryBank.connect(alice).execute(
        0,
        balancer_spell.address,
        iface.encodeFunctionData("addLiquidityWERC20", [
          lp.address,
          [
            dai_amt,  // supply DAI
            weth_amt,   // supply WETH
            lp_amt,  // supply LP
            borrow_dai_amt,  // borrow DAI
            borrow_weth_amt,  // borrow WETH
            0,  // borrow LP tokens
            0
          ]
        ])
      );

      curABal = await dai.balanceOf(alice.address);
      curBBal = await weth.balanceOf(alice.address);
      curLPBal = await lp.balanceOf(alice.address);
      curLPBal_bank = await lp.balanceOf(blueberryBank.address);
      curLPBal_werc20 = await lp.balanceOf(werc20.address);
    });
  });
});