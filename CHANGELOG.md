# Changelog

## [0.4.1](https://github.com/SunReye/SunReye/compare/server-v0.4.0...server-v0.4.1) (2026-07-12)


### Reverts

* **docs:** publish the docs site under /SunReye again ([bee80d8](https://github.com/SunReye/SunReye/commit/bee80d8b863fcce2f8e3234b1cc0f431a84631c8))

## [0.4.0](https://github.com/SunReye/SunReye/compare/server-v0.3.0...server-v0.4.0) (2026-07-12)


### Features

* **docs:** publish the docs site at the organization root ([710a5ea](https://github.com/SunReye/SunReye/commit/710a5eabf8185c8551130c7457c05a373bba7612))

## [0.3.0](https://github.com/ediiiz/SunReye/compare/server-v0.2.2...server-v0.3.0) (2026-07-12)


### Features

* **addon:** ship server and migrate as one compiled binary ([68fd0db](https://github.com/ediiiz/SunReye/commit/68fd0db4db22a42f6253032363eb4ba3f9940bba))
* **web:** add adapter-static build mode for prefix-agnostic deployments ([727fa3c](https://github.com/ediiiz/SunReye/commit/727fa3c6924c8878d88f60171915139233feca0f))

## [0.2.2](https://github.com/ediiiz/SunReye/compare/server-v0.2.1...server-v0.2.2) (2026-07-12)


### Bug Fixes

* **auth:** resolve rate-limit client IP from x-forwarded-for ([f16c1b1](https://github.com/ediiiz/SunReye/commit/f16c1b1e7299b0b6a6147dd668e410a8c0fddb78))

## [0.2.1](https://github.com/ediiiz/SunReye/compare/server-v0.2.0...server-v0.2.1) (2026-07-12)


### Miscellaneous Chores

* **server:** Synchronize sunreye-stack versions

## [0.2.0](https://github.com/ediiiz/SunReye/compare/server-v0.1.0...server-v0.2.0) (2026-07-12)


### Features

* **addon:** home assistant addon with embedded timescaledb ([f22b52a](https://github.com/ediiiz/SunReye/commit/f22b52a039adbb10374357afcd5a299323727f5c))
* **db:** journaled migrations with baseline stamping and downgrade guard ([3514089](https://github.com/ediiiz/SunReye/commit/3514089b3c741daeee86670411d6487f9711e67a))
* **server:** same-origin auth model, /healthz, and host binding ([3d9e9b1](https://github.com/ediiiz/SunReye/commit/3d9e9b1e95fecc0c863f1f783ea8048542df802b))
* **web:** runtime API base and hash routing for reverse-proxy prefixes ([1aa8661](https://github.com/ediiiz/SunReye/commit/1aa8661b1b5ca0fac7932d12a92c419941c53b1e))


### Bug Fixes

* **server:** exclude serialport from compiled binary, pin bun builders ([1115a38](https://github.com/ediiiz/SunReye/commit/1115a386ff4b10f45d2ee2f1c442f87400cb3171))

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
