# Changelog

## [0.7.1](https://github.com/SunReye/SunReye/compare/web-v0.7.0...web-v0.7.1) (2026-07-13)


### Bug Fixes

* **profiles:** register downloaded profiles immediately, no restart ([7bca64e](https://github.com/SunReye/SunReye/commit/7bca64e994e04de6cd96554fe2623f6645268f60))

## [0.7.0](https://github.com/SunReye/SunReye/compare/web-v0.6.0...web-v0.7.0) (2026-07-13)


### Features

* **web:** add a day stepper to the history range picker ([d9e29c3](https://github.com/SunReye/SunReye/commit/d9e29c33e8e1c978c111384eacd2d29620408f9f))
* **web:** add custom charts section to history page ([c46eee9](https://github.com/SunReye/SunReye/commit/c46eee9c95a0dfb908a88b465829d5f53c050618))
* **web:** add instance-wide date & time display preferences ([4d5e130](https://github.com/SunReye/SunReye/commit/4d5e1307f90d2920b248b69054366c295219a0a4))
* **web:** auto-save profile sources with optimistic updates ([2f20016](https://github.com/SunReye/SunReye/commit/2f2001638c4149ba8de1e86052abb858edaaed21))
* **web:** group available profiles by manufacturer and family ([a202d44](https://github.com/SunReye/SunReye/commit/a202d44aed33fafd465ed6c4fbdd96a6eac6697c))
* **web:** show source repo on available profiles ([52d4411](https://github.com/SunReye/SunReye/commit/52d44111f3ffe559564ab4bc96ae59bbf1c54fc5))
* **web:** step forward into live view from the history stepper ([e75507d](https://github.com/SunReye/SunReye/commit/e75507d1f882c033884eba95e3c58ebf75ed51fe))
* **web:** surface available profile updates in settings ([a8a6bf4](https://github.com/SunReye/SunReye/commit/a8a6bf484757c7b7866aa38751ce0bd9da03b366))


### Bug Fixes

* **web:** derive active route from the hash under the hash router ([63a0ba3](https://github.com/SunReye/SunReye/commit/63a0ba30658dd88a01a3cb798f270055c5872db2))
* **web:** keep the desktop sidebar open after navigation ([dbc0aef](https://github.com/SunReye/SunReye/commit/dbc0aef25942ee32e80fe365001758f83a15cfb5))
* **web:** stack profile meta over source repo on mobile ([72b2c1e](https://github.com/SunReye/SunReye/commit/72b2c1efbbdd6ef5a4e2e90ca6292fb707f32eaf))
* **web:** step into today from a non-day range in history stepper ([b71915d](https://github.com/SunReye/SunReye/commit/b71915d1b1d056fa4e900d4c976dfbde8d7a7f4b))

## [0.6.0](https://github.com/SunReye/SunReye/compare/web-v0.5.0...web-v0.6.0) (2026-07-13)


### Features

* **web:** add lock toggle to controls page ([af984dd](https://github.com/SunReye/SunReye/commit/af984dd0938935cb2115c913da4278ae279a1705))
* **web:** align setup profile picker with settings and animate selection ([ec64c05](https://github.com/SunReye/SunReye/commit/ec64c050146b547525762d4d8aec7e9345c72c61))
* **web:** move settings to sidebar footer, close nav on click ([3bcd3fe](https://github.com/SunReye/SunReye/commit/3bcd3feca2ff29deece1363fb431376501be3715))
* **web:** searchable profiles grouped by manufacturer with restart confirm ([d543faa](https://github.com/SunReye/SunReye/commit/d543faa8fab307f36f4b2151f099c79dd30aa1c0))


### Bug Fixes

* **web:** resolve mobile overflow across settings and setup ([4460188](https://github.com/SunReye/SunReye/commit/4460188886e85dbb17a9d033023d2ddd2e874a52))
* **web:** stop history chart overflow on non-live ranges ([e7833ed](https://github.com/SunReye/SunReye/commit/e7833ed0ed1021d67495b11bfa471d947b0b72d2))
* **web:** use native Tabs for settings navigation ([79b377d](https://github.com/SunReye/SunReye/commit/79b377d0e902cd65e85f6038ca11038b5e197637))

## [0.5.0](https://github.com/SunReye/SunReye/compare/web-v0.4.0...web-v0.5.0) (2026-07-12)


### Miscellaneous Chores

* **web:** Synchronize sunreye-stack versions

## [0.4.0](https://github.com/SunReye/SunReye/compare/web-v0.3.0...web-v0.4.0) (2026-07-12)


### Miscellaneous Chores

* **web:** Synchronize sunreye-stack versions

## [0.3.0](https://github.com/ediiiz/SunReye/compare/web-v0.2.2...web-v0.3.0) (2026-07-12)


### Features

* **web:** add adapter-static build mode for prefix-agnostic deployments ([727fa3c](https://github.com/ediiiz/SunReye/commit/727fa3c6924c8878d88f60171915139233feca0f))


### Bug Fixes

* **web:** anchor hash navigation to the document URL under ingress ([5a22b1e](https://github.com/ediiiz/SunReye/commit/5a22b1ec425069f46dbb0d458774ab58e9de27f6))

## [0.2.2](https://github.com/ediiiz/SunReye/compare/web-v0.2.1...web-v0.2.2) (2026-07-12)


### Bug Fixes

* **web:** route internal navigation through resolve() for the hash router ([1615518](https://github.com/ediiiz/SunReye/commit/1615518dbc735d21871ea93c9e8dc0dc57bd7efc))

## [0.2.1](https://github.com/ediiiz/SunReye/compare/web-v0.2.0...web-v0.2.1) (2026-07-12)


### Miscellaneous Chores

* **web:** Synchronize sunreye-stack versions

## [0.2.0](https://github.com/ediiiz/SunReye/compare/web-v0.1.0...web-v0.2.0) (2026-07-12)


### Features

* **web:** runtime API base and hash routing for reverse-proxy prefixes ([1aa8661](https://github.com/ediiiz/SunReye/commit/1aa8661b1b5ca0fac7932d12a92c419941c53b1e))

## [0.1.0](https://github.com/ediiiz/SunReye/compare/web-v0.0.1...web-v0.1.0) (2026-07-11)


### Features

* **brand:** unify logo across docs and web, align docs theme with app ([81dbad0](https://github.com/ediiiz/SunReye/commit/81dbad07494e2a02df6f66643f6d952acdceb40e))
* **costs:** range picker with contextual net-cost bar charts ([425a134](https://github.com/ediiiz/SunReye/commit/425a1344cc43e0faad0c068a67ab01e738806d6b))
* **costs:** range-driven energy split + solar self-consumption savings ([d1c5b17](https://github.com/ediiiz/SunReye/commit/d1c5b1775d76d29c14e1493d0e102d38e03763be))
* **costs:** split total-cost bars into diverging component stack ([a0428e9](https://github.com/ediiiz/SunReye/commit/a0428e932979d1b737fe0a9896906c9265c07702))
* **costs:** total-cost series, cleaner layout, fade transitions ([4016f4f](https://github.com/ediiiz/SunReye/commit/4016f4ff312aec2a00908d6fcfb3bfccda83eb15))
* **inverter:** add computed self-consumption and efficiency metrics ([73e0043](https://github.com/ediiiz/SunReye/commit/73e00431efa69f177e7cc978f125f637b791cc7e))
* **inverter:** drive time-of-use target by battery mode ([e3b1188](https://github.com/ediiiz/SunReye/commit/e3b1188c4c791a4f6e5287628e94130a93fdff63))
* **settings:** add admin danger-zone data reset ([c0e03db](https://github.com/ediiiz/SunReye/commit/c0e03db0224a766078867cccddfa07f3d1d783ab))
* **web:** use minute rollups up to a week, hourly beyond on history ([a605a5d](https://github.com/ediiiz/SunReye/commit/a605a5d60c83d4646ecdabd7812639ad4016fd07))
* wire Deye real-time inverter dashboard scaffold ([dc1afce](https://github.com/ediiiz/SunReye/commit/dc1afcecac6097fbdf6793e7e17397fb0c6e22a7))


### Bug Fixes

* **inverter:** make saved host optional for unconfigured installs ([12a82dc](https://github.com/ediiiz/SunReye/commit/12a82dc519e1582caa4d157fd7d58cf52f6b389a))
* **web:** mobile layout for costs charts and range picker ([76e4c14](https://github.com/ediiiz/SunReye/commit/76e4c14af006d7f169df0f4810ff4096fc0079ba))
* **web:** preserve edited number-input value on Apply ([76c6f22](https://github.com/ediiiz/SunReye/commit/76c6f22965cf8ab476de0978d45305adda100f7c))
* **web:** seed numeric control input so stepper increments from current value ([a092006](https://github.com/ediiiz/SunReye/commit/a0920065c62f324a8ca98279deb464197730f68c))
* **web:** stop eden date coercion breaking cost period keys ([f15971d](https://github.com/ediiiz/SunReye/commit/f15971d0e0b0d5686ede70f361b93802668e49cc))
