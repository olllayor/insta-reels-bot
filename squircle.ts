import sharp from 'sharp';

function generateSquirclePath(size: number, n: number = 5): string {
	const r = size / 2;
	const cx = r;
	const cy = r;
	const points = 512;
	const coords: string[] = [];

	for (let i = 0; i <= points; i++) {
		const t = (i / points) * 2 * Math.PI;
		const cos = Math.cos(t);
		const sin = Math.sin(t);

		const x = cx + r * Math.sign(cos) * Math.pow(Math.abs(cos), 2 / n);
		const y = cy + r * Math.sign(sin) * Math.pow(Math.abs(sin), 2 / n);

		coords.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
	}

	return coords.join(' ') + ' Z';
}

function generateMaskSvg(size: number): string {
	const path = generateSquirclePath(size, 5);
	return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <path d="${path}" fill="white"/>
    </svg>`;
}

export async function squircleCrop(inputBuffer: Buffer, outputSize?: number): Promise<Buffer> {
	const metadata = await sharp(inputBuffer).metadata();
	const width = metadata.width || 1;
	const height = metadata.height || 1;
	const size = outputSize || Math.min(width, height);

	const maskSvg = Buffer.from(generateMaskSvg(size));

	// Step 1: Resize to square, ensure alpha exists, apply squircle mask
	const maskedImage = await sharp(inputBuffer)
		.resize(size, size, { fit: 'cover', position: 'centre' })
		.ensureAlpha()
		.composite([{ input: maskSvg, blend: 'dest-in' }])
		.png()
		.toBuffer();

	// Step 2: Composite the masked image onto a solid black background
	return sharp({
		create: {
			width: size,
			height: size,
			channels: 3,
			background: { r: 0, g: 0, b: 0 },
		},
	})
		.composite([{ input: maskedImage, blend: 'over' }])
		.png()
		.toBuffer();
}