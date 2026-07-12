# SunReye Home Assistant Addon

Self-hosted solar / hybrid inverter monitoring, control, and integration:
Modbus polling at 1 Hz, TimescaleDB history with automatic rollups, a live
dashboard in the HA sidebar, a typed REST API, and an MQTT bridge with Home
Assistant discovery.

Everything runs inside the addon — including the database, stored in the
addon's `/data` and covered by Home Assistant backups. Point it at an external
PostgreSQL+TimescaleDB instead via the `external_database_url` option.

See DOCS (the Documentation tab) for setup, options, backups, and the upgrade
story. Full project documentation: <https://github.com/ediiiz/SunReye>.
