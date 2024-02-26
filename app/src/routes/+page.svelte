<script lang="ts">
	import Dropzone from 'svelte-file-dropzone';
	import { Printer, WebUSB, Align, Style, Image as EscImage, type ImageData } from 'escpos-buffer';
	import { fade, slide } from 'svelte/transition';
	import wrap from 'word-wrap';
	import capabilities, { type SupportedModel } from 'escpos-buffer/dist/capabilities';
	import { persisted } from 'svelte-persisted-store';
	import type Quill from 'quill';
	import { browser, dev } from '$app/environment';
	// The MIT License
	// Copyright (c) 2011 Ian Li http://ianli.com
	// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
	// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
	// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
	import fortunes from '$lib/fortunes.txt?raw';
	import logo from './logo.png';
	import footer from './footer.png';

	const capabilityList = (browser || dev ? capabilities : capabilities.default).models.map(
		(m) => m.model
	);

	let loaded = false;
	let canvas: HTMLCanvasElement;
	$: ctx = canvas?.getContext('2d');

	let showFiles = false;
	let chosenModel = persisted<SupportedModel>('printer-model', 'POS-80');
	let numCols = persisted<number>('printer-cols', 32);
	let MaxDPI = persisted<number>('printer-dpi', 384);

	let printer: Printer | undefined = undefined;
	let connection: WebUSB | undefined = undefined;
	const connect = async () => {
		const device = await navigator.usb.requestDevice({
			filters: [
				// {
				// 	vendorId: 0x0456
				// }
			]
		});
		connection = new WebUSB(device);
		await refreshConnection();
	};
	const refreshConnection = async () => {
		console.log('Refreshing connection');
		if (!connection) return;
		printer = await Printer.CONNECT($chosenModel, connection);
		await printer.setColumns($numCols);
		loaded = true;
	};
	let processing = false;

	async function printImage(printer: Printer, src: string) {
		// Create canvas
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Create image
		await new Promise<void>((resolve) => {
			const img = new Image();
			img.onload = () => {
				let scaleFactor = Math.min($MaxDPI || 384, img.naturalWidth) / img.naturalWidth;
				canvas.width = img.naturalWidth * scaleFactor;
				canvas.height = img.naturalHeight * scaleFactor;
				ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
				resolve();
			};
			img.src = src;
		});
		// Get image data
		let image_data = ctx.getImageData(0, 0, canvas.width, canvas.height);

		// Print
		const image = new EscImage({
			data: image_data.data as any,
			width: image_data.width,
			height: image_data.height
		});
		await printer.draw(image);
	}
	const fortuneItems = fortunes.split('\n');
	const print = async (name = false) => {
		let textToPrint = fortuneItems[Math.floor(Math.random() * fortuneItems.length)];
		if (!printer) {
			console.log(textToPrint);
			return;
		}
		try {
			printer.feed(1);
			await printImage(printer, logo);
			if (name) {
				textToPrint = `Thanks for registering ${name}!\n${textToPrint}`;
			}
			printer.feed(1);
			await printer.withStyle(
				{
					align: Align.Center,
					height: 1,
					width: 1
				},
				async () => {
					const wrappedLines = wrap(textToPrint.replaceAll(/[^\x00-\x7F]+/g, ' '), {
						width: $numCols,
						trim: true
					}).split('\n');
					console.log(wrappedLines);
					for (const line of wrappedLines) {
						await printer!.writeln(line.trim());
					}
				}
			);
			printer.feed(1);
			await printImage(printer, footer);
			await printer.feed(4);
			await printer.cutter();
			showFiles = false;
		} catch (error) {
			console.log("Wow, looks like the printer didn't work!", error);
			return;
		}
	};

	let lastMemberCount: number | false = false;
	let interval: number;
	let refreshing = false;
	$: if (loaded) {
		if (interval) clearInterval(interval);
		interval = setInterval(async () => {
			if (loaded) {
				refreshing = true;
				await fetch('/memberCount')
					.then((res) => res.json())
					.then((data) => {
						if (lastMemberCount === false) {
							lastMemberCount = data.count;
						} else if (lastMemberCount < data.count) {
							const newMembers = data.count - lastMemberCount;
							lastMemberCount = data.count as number;
							for (let i = 0; i < newMembers; i++) {
								// Get the name of the new member. First in the list is the most recent
								const name = data.members[i];
								print(name);
							}
						}
					});
				refreshing = false;
			}
		}, 1000);
	}
</script>

<main class="receipt receipt-after">
	<h1>Receipt Printer</h1>
	<p class="balance">
		Welcome to a web-based receipt printer! Press the button below to connect, and then enter what
		you'd like printed
	</p>
	<div class="pt-3 flex flex-wrap items-end gap-3 justify-center">
		{#if !loaded}
			<button
				on:click={() => {
					connect();
				}}>Connect to printer</button
			>
		{:else}
			<button
				class="!bg-green-800"
				on:click={() => {
					print();
				}}>Manually dispense fortune</button
			>
		{/if}
		<div class="flex gap-3 flex-nowrap">
			<label class="input-label">
				<span class="text-gray-700"> Model </span>
				<select
					class="form-select px-4 py-3 rounded-full"
					bind:value={$chosenModel}
					on:change={() => {
						refreshConnection();
					}}
				>
					{#each capabilityList as capability (capability)}
						<option value={capability}>{capability}</option>
					{/each}
				</select>
			</label>
			<label class="input-label">
				<span class="text-gray-700"> Number of Columns </span>

				<input
					type="number"
					bind:value={$numCols}
					placeholder="Cols..."
					title="Number of Columns"
					on:change={() => {
						refreshConnection();
					}}
				/>
			</label>
			<label class="input-label">
				<span class="text-gray-700"> Max DPI </span>

				<input
					type="number"
					bind:value={$MaxDPI}
					placeholder="384"
					title="Max DPI (default 384)"
					on:change={() => {
						refreshConnection();
					}}
				/>
			</label>
		</div>
	</div>

	{#if processing}
		<div
			class="absolute inset-0 bg-white bg-opacity-80 backdrop-blur flex justify-center align-middle items-center"
			transition:fade
		>
			<div class="text-6xl text-center animate-bounce">❤️‍🔥</div>
		</div>
	{/if}
	<div class="text-center my-4 h-6">
		{#if refreshing}
			<div transition:fade>Refreshing... {lastMemberCount} members</div>
		{/if}
	</div>
</main>

<style lang="postcss">
	:global(body) {
		@apply bg-cover bg-fixed;
		background-image: linear-gradient(135deg, #ccffff 0%, #ffffcc 50%, #ffccff 100%);
	}
	h1 {
		@apply mb-4 text-center text-4xl font-bold;
	}
	.balance {
		/* Balance break */
		@apply text-center;
		text-wrap: balance;
	}
	.receipt {
		@apply m-4 mx-auto w-full max-w-prose rounded bg-white px-7 py-6 drop-shadow-md;
		--zag-size: 0.8rem;
		&.receipt-after {
			@apply rounded-b-none;
			&:after {
				@apply absolute left-0 top-full block w-full;
				@apply bg-left-bottom bg-repeat-x;
				height: var(--zag-size);
				background: linear-gradient(-45deg, transparent var(--zag-size), #fff var(--zag-size)),
					linear-gradient(45deg, transparent var(--zag-size), #fff 0);
				background-size: var(--zag-size) var(--zag-size);
				content: ' ';
			}
		}
		&.receipt-before {
			@apply mt-10 rounded-t-none;
			&:before {
				@apply absolute bottom-full left-0 block w-full;
				@apply bg-left-bottom bg-repeat-x;
				height: var(--zag-size);
				background: linear-gradient(-45deg, #fff calc(var(--zag-size) / 2), transparent 0),
					linear-gradient(45deg, #fff calc(var(--zag-size) / 2), transparent 0);
				background-size: var(--zag-size) var(--zag-size);
				content: ' ';
			}
		}
	}
	main {
		@apply mt-16;
	}
	button {
		@apply rounded bg-black bg-opacity-100 px-4 py-2 font-bold text-white transition;
		&:hover {
			@apply bg-opacity-70;
		}
	}
	.input-label {
		@apply block shrink;
		& input,
		& select {
			@apply block rounded px-4 py-3;
		}
	}
</style>
