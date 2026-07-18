<script lang="ts">
	import InverterForm from '$lib/components/settings/inverter-form.svelte';
	import { getSettingsStatus } from '../status-context';

	const status = getSettingsStatus();
</script>

<InverterForm status={status.current?.inverter ?? null} />
