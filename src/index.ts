import Axios from 'axios';
import * as crypto from 'crypto';
import * as cheerio from 'cheerio';

export type ExtractedVideo = Record<string, string>

export class NaverTV {
    private readonly PLAYER_INFO_REGEX: RegExp = /var ghtPlayerInfo = {.+?}.+(?=jQuery)/gs;
    private readonly USER_AGENT: string = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Safari/537.36';
    
    constructor(private url: string) {
        void 0;
    }

    private uuidv4() {
        const pool = new Uint8Array(256);
        let ptr = pool.length;
    
        if (ptr > pool.length - 16) {
            crypto.randomFillSync<Uint8Array>(pool);
            ptr = 0;
        }
    
        const rnds = pool.slice(ptr, (ptr += 16));
    
        rnds[6] = (rnds[6] & 0x0f) | 0x40;
        rnds[8] = (rnds[8] & 0x3f) | 0x80;
    
        const buffer = [];
    
        for (let i = 0; i < 256; i++) {
            buffer.push((i + 0x100).toString(16).slice(1));
        }

        let uuid: string = '';

        for (let i = 0; i < 16; i++) {
            if (i == 4 || i == 6 || i == 8 || i == 10) {
                uuid += '-';
            }
            uuid += buffer[rnds[i]];
        }
    
        return uuid;
    }

    private async urlFormat(): Promise<void> {
        const { data: { html } } = await Axios.get('https://tv.naver.com/oembed', {
            params: {
                url: this.url,
                format: 'json'
            }
        });

        if (!html) throw new Error('invalid url');
        
        const $ = cheerio.load(html);
        const url = $('iframe')?.attr('src');
        
        if (!url) throw new Error('cannot find url');
        
        this.url = url;
    }

    private async getConfig() {
        await this.urlFormat();
        
        const { data: doc } = await Axios.get(this.url);
        const [ stack ] = doc.match(this.PLAYER_INFO_REGEX);

        const script = stack.replace(/clip: {.+?},/s, '') + ';ghtPlayerInfo';

        const ghtPlayerInfo = eval(script);

        // @ts-ignore
        return ghtPlayerInfo;
    }

    public async extract(): Promise<ExtractedVideo> {
        const {
            videoId,
            inKey: key,
            gladParam: { sid }
        } = 
        await this.getConfig();

        const { data: { videos: { list } } } = await Axios.get(`https://apis.naver.com/rmcnmv/rmcnmv/vod/play/v2.0/${videoId}`, {
            params: {
                key,
                sid,
                pid: this.uuidv4(),
                nonce: `${new Date().getTime()}`,
                devt: 'html5_pc',
                prv: 'N',
                aup: 'N',
                stpb: 'N',
                cpl: 'en',
                adu: '/',
                adi: JSON.stringify([ { adSystem: null } ])
            },
            headers: {
                'Referer': this.url,
                'User-Agent': this.USER_AGENT
            }
        });

        return list.reduce((r: any, { encodingOption: { name: quality }, source }) => ({...r, [quality]: source}), <ExtractedVideo>{});
    }
}
