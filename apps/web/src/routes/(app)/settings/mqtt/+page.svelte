<script lang="ts">
	import MqttForm from '$lib/components/settings/mqtt-form.svelte';
	import { getSettingsStatus } from '../status-context';

	const status = getSettingsStatus();
</script>

<MqttForm status={status.current?.mqtt ?? null} />
