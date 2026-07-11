# Changelog

## [0.1.0](https://github.com/ediiiz/SunReye/compare/server-v0.0.1...server-v0.1.0) (2026-07-11)


### Features

* **brand:** unify logo across docs and web, align docs theme with app ([81dbad0](https://github.com/ediiiz/SunReye/commit/81dbad07494e2a02df6f66643f6d952acdceb40e))
* **costs:** range picker with contextual net-cost bar charts ([425a134](https://github.com/ediiiz/SunReye/commit/425a1344cc43e0faad0c068a67ab01e738806d6b))
* **costs:** range-driven energy split + solar self-consumption savings ([d1c5b17](https://github.com/ediiiz/SunReye/commit/d1c5b1775d76d29c14e1493d0e102d38e03763be))
* **costs:** total-cost series, cleaner layout, fade transitions ([4016f4f](https://github.com/ediiiz/SunReye/commit/4016f4ff312aec2a00908d6fcfb3bfccda83eb15))
* **docker:** auto-apply schema via one-shot migrate service ([259cbaf](https://github.com/ediiiz/SunReye/commit/259cbafc012918a533f335cbb0afc08f591d0ec6))
* **inverter:** add computed self-consumption and efficiency metrics ([73e0043](https://github.com/ediiiz/SunReye/commit/73e00431efa69f177e7cc978f125f637b791cc7e))
* **inverter:** drive time-of-use target by battery mode ([e3b1188](https://github.com/ediiiz/SunReye/commit/e3b1188c4c791a4f6e5287628e94130a93fdff63))
* **settings:** add admin danger-zone data reset ([c0e03db](https://github.com/ediiiz/SunReye/commit/c0e03db0224a766078867cccddfa07f3d1d783ab))
* wire Deye real-time inverter dashboard scaffold ([dc1afce](https://github.com/ediiiz/SunReye/commit/dc1afcecac6097fbdf6793e7e17397fb0c6e22a7))


### Bug Fixes

* **cost:** price counters by cross-bucket delta, not intra-bucket max−min ([8fdd54c](https://github.com/ediiiz/SunReye/commit/8fdd54c3309add5343e3e5813c18d38c7276f71c))
* **env:** change defaults and make boot more reliable ([97b8c25](https://github.com/ediiiz/SunReye/commit/97b8c2518b325efddc79e8b501d31cdbf1ab4234))
* **inverter-core:** serialize modbus client and write via FC16 ([2cd1b2c](https://github.com/ediiiz/SunReye/commit/2cd1b2cfff9c51dd968f75396972e016d149a0db))
* **inverter:** make saved host optional for unconfigured installs ([12a82dc](https://github.com/ediiiz/SunReye/commit/12a82dc519e1582caa4d157fd7d58cf52f6b389a))
* **server:** surface inverter write failures as 502 with logged cause ([b95f63b](https://github.com/ediiiz/SunReye/commit/b95f63b622cb3acdac06ec0713c98df868f30706))
