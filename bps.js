// Aplica um patch BPS (formato do beat/Flips) sobre a ROM do jogador, conferindo os CRC32.
(function (root) {
    const TABLE = new Int32Array(256).map((_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        return c;
    });

    function crc32(buf, end) {
        let c = -1;
        const n = end === undefined ? buf.length : end;
        for (let i = 0; i < n; i++)
            c = TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ -1) >>> 0;
    }

    function u32(buf, at) {
        return (buf[at] | (buf[at + 1] << 8) | (buf[at + 2] << 16) | (buf[at + 3] << 24)) >>> 0;
    }

    // devolve {source, target} com os CRC esperados, sem aplicar
    function info(patch) {
        const end = patch.length - 12;
        return { source: u32(patch, end), target: u32(patch, end + 4) };
    }

    function apply(source, patch) {
        let p = 0;
        const end = patch.length - 12;
        function num() {
            let data = 0, shift = 1;
            for (;;) {
                const x = patch[p++];
                data += (x & 0x7F) * shift;
                if (x & 0x80)
                    return data;
                shift *= 128;
                data += shift;
            }
        }
        if (String.fromCharCode(patch[0], patch[1], patch[2], patch[3]) !== 'BPS1')
            throw new Error('patch inválido');
        if (crc32(patch, patch.length - 4) !== u32(patch, patch.length - 4))
            throw new Error('patch corrompido');
        if (crc32(source) !== info(patch).source)
            throw new Error('rom errada');
        p = 4;
        num();
        const target = new Uint8Array(num());
        const meta = num(); // pula os metadados (p += num() leria p antes de num() avançar)
        p += meta;
        let out = 0, srcRel = 0, dstRel = 0;
        while (p < end) {
            const d = num();
            let len = (d >> 2) + 1;
            switch (d & 3) {
            case 0:
                target.set(source.subarray(out, out + len), out);
                out += len;
                break;
            case 1:
                target.set(patch.subarray(p, p + len), out);
                p += len;
                out += len;
                break;
            case 2: {
                const o = num();
                srcRel += (o & 1 ? -1 : 1) * (o >> 1);
                target.set(source.subarray(srcRel, srcRel + len), out);
                srcRel += len;
                out += len;
                break;
            }
            default: {
                const o = num();
                dstRel += (o & 1 ? -1 : 1) * (o >> 1);
                while (len--)
                    target[out++] = target[dstRel++];
            }
            }
        }
        if (crc32(target) !== info(patch).target)
            throw new Error('resultado diferente do esperado');
        return target;
    }

    const api = { apply, info, crc32 };
    if (typeof module !== 'undefined')
        module.exports = api;
    else
        root.BPS = api;
})(this);
