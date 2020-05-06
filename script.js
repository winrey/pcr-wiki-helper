// ==UserScript==
// @name         PCR图书馆辅助计算器
// @namespace    http://tampermonkey.net/
// @version      1.0.2
// @description  辅助计算所需体力，总次数等等
// @author       Winrey
// @license      MIT
// @supportURL   https://github.com/winrey/pcr-wiki-helper/issues
// @homepage     https://github.com/winrey/pcr-wiki-helper
// @run-at       document-start
// @connect      cdn.jsdelivr.net
// @match        *://pcredivewiki.tw/Armory
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.info
// @require      https://cdn.jsdelivr.net/npm/jquery@3.4.0/dist/jquery.min.js
// @require      https://cdn.jsdelivr.net/gh/winrey/pcr-wiki-helper@master/js/solver.js
// ==/UserScript==

(function() {
    'use strict';

    const sleep = time => new Promise(r => setTimeout(r), time);

    $(document).ready(function() {
        function autoSwitch2MapList() {
            $(".title-fixed-wrap .armory-function").children()[2].click();
        }

        function toPage(num) {
            const $table = $(".mapDrop-table:not(.helper)");
            const $pages = $($table.find("tr").toArray().pop());
            const $frist = $($pages.find("li").toArray()[num || 1]);
            $frist.children()[0].click()
        }

        async function getMapData() {
            function rowParser($tr, page, index) {
                function parseItem($item) {
                    const url = $($item.find("a")[0]).attr("href");
                    const name = $($item.find("img")[0]).attr("title");
                    const img = $($item.find("img")[0]).attr("src");
                    const odd = parseInt($($item.find("h6.dropOdd")[0]).text()) / 100; // %不算在parseInt内
                    const count = parseInt($($item.find(".py-1")[0]).text());
                    return { url: url, name: name, img: img, odd: odd, count: count };
                }
                const children = $tr.children().map(function(){return $(this)});
                const name = children[0].text();
                const requirement = parseInt(children[1].text());
                const items = $(children[2].children()[0]).children().toArray().map(v => parseItem($(v)));
                return { name: name, requirement: requirement, items: items, page: page, index: index };
            }

            function next($table) {
                const $pages = $($table.find("tr").toArray().pop());
                const $next = $($pages.find("li").toArray().pop());
                if ($next.hasClass("disabled"))
                    return false;
                $next.children()[0].click()
                return true;
            }

            let $table = $(".mapDrop-table:not(.helper)");
            const data = [];
            toPage(1);
            let page = 1;
            await sleep(100);
            do {
                await sleep(100);
                $table = $(".mapDrop-table:not(.helper)");
                const pageData = $table.find("tr")
                  .toArray()
                  .map($)
                  .slice(0,-1)  // 最后一行是分页栏
                  .map((m, i) => rowParser(m, page, i));
                data.push.apply(data, pageData);
                page += 1;
            } while(next($table))
            toPage(1);
            return data;
        }

        function getCost(name) {
            if (name === "1-1") return 6
            if (name.startsWith("1-")) return 8;
            if (name.startsWith("2-")) return 8;
            if (name.startsWith("3-")) return 8;
            if (name.startsWith("4-")) return 9;
            if (name.startsWith("5-")) return 9;
            if (name.startsWith("6-")) return 9;
            return 10;
        }

        function calcResult(data) {
            data = data.map(chan => {
                const sum = (...arr) => [].concat(...arr).reduce((acc, val) => acc + val, 0);
                chan.exception = sum(chan.items.map(v => v.count * v.odd));
                chan.max = Math.max.apply(null, chan.items.map(v => v.count / v.odd));
                chan.min = Math.min.apply(null, chan.items.filter(v => v.count).map(v => v.count / v.odd));
                chan.effective = sum.apply(null, chan.items.map(v => v.count ? v.odd : 0));
                return chan;
            });
            const model = {
                "optimize": "cost",
                "opType": "min",
                "constraints": (() => {
                    const equis = {};
                    data.forEach(c => c.items.forEach(e => equis[e.name] = {"min": e.count}));
                    return equis;
                })(),
                "variables": (() => {
                    const challs = {};
                    data.forEach(c => {
                        const cMap = {};
                        c.items.forEach(item => cMap[item.name] = item.odd);
                        cMap.cost = getCost(c.name);
                        challs[c.name] = cMap;
                    });
                    return challs;
                })(),
            };
            console.log("model", model);
            const lp_result = solver.Solve(model);
            console.log(lp_result);
            for(let k in lp_result) {
                if (!k.includes("-")) continue;
                const target = data.find(c => c.name === k);
                if (target)
                    target.times = lp_result[k] || 0;
            }
            return {
                total: lp_result.result,
                map: data
                  .sort((a, b) => b.times - a.times)
                  .sort((a, b) => b.effective - a.effective)
            };
        }

        const BOUNS_KEY = "___bouns";

        function askBouns() {
            const bouns = parseInt(prompt("请输入关卡倍数（如n3，n2等，默认为1倍）") || "1") || 1;
            sessionStorage.setItem(BOUNS_KEY, bouns);
            return bouns;
        }

        function getBouns() {
            let bouns = parseInt(sessionStorage.getItem("___bouns"));
            if (!bouns) {
                bouns = askBouns();
            }
            return bouns
        }

        function showResult(data) {
            const bouns = getBouns();
            /*
            const lines = [];
            lines.push(`总体力需求：${Math.round(data.total / bouns)}`);
            lines.push("----------------");
            lines.push("关卡 | 有效期望 | 有效次数 | 推荐次数 | 最大次数 | 所在页数");
            data.map.filter(m => m.times).forEach(m => {
                const cols = [];
                const push = (content, width) => {
                    content = String(content);
                    if (width && content.length < width) {
                        const space = "_";
                        content = space.repeat(Math.floor((width - content.length) / 2)) + content;
                        content = content.padEnd(width, space);
                    }
                    cols.push(content);
                };
                push(m.name, 5);
                push(m.effective, 9);
                push(Math.ceil(m.min / bouns), 10);
                push(Math.ceil((m.times || 0) / bouns), 9);
                push(Math.ceil(m.max / bouns), 10);
                push(m.page, 10);
                lines.push(cols.join("|"));
            });
            alert(lines.join("\n"));
            */
            const table = genTable(data.map.filter(m => m.times));
            const comment = $.parseHTML('<a href>说明</a>');
            const commentLines = [];
            commentLines.push("推荐使用方法：按照列表顺序刷图，数量不要超过「适用」和「推荐」两者的最大值，完成后修改数量，重新根据新情景计算。");
            commentLines.push("");
            commentLines.push("注意：如果您尚缺好感，请考虑以1,6,11次扫荡为单位刷图，这样可以好感获得最大化。");
            commentLines.push("");
            commentLines.push("---表头说明---");
            commentLines.push("『章节』关卡编号。点击可以自动跳转到图书馆原表中关卡所在页数。方便修改数量。");
            commentLines.push("『需求』关卡需求。图中所需装备总数。");
            commentLines.push("『效率』装备效率。图中所有有效装备掉落的概率和。");
            commentLines.push("『适用』有效次数。预计能保持「效率」不变的次数。");
            commentLines.push("『推荐』推荐次数。假设概率固定，由考虑体力的线性规划算法计算出的总最优刷图次数。");
            commentLines.push("『最大』最大次数。最近该图需要的最高次数。");
            $(comment[0]).click(() => alert(commentLines.join('\n')));
            showModalByDom(`总体力需求：${Math.round(data.total / bouns)} &nbsp;&nbsp; 当前倍率：${bouns} &nbsp;&nbsp; `, comment, table);
        }

        function createModal(...content) {
            const containerStyle = `
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                position: fixed;
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                pointer-events: none;
                transition: all ease-in-out 0.5s;
            `;
            const maskStyle = `
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.7);
                position: absolute;
                z-index: 11000;
            `;
            const boxStyle = `
                min-width: 80%;
                z-index: 12000;
            `;
            const contentStyle = `
                width: 100%;
                margin-bottom: 10px;
                max-height: 80vh;
                overflow: scroll;
            `
            const html = `
                <div id="helper--modal" style="${containerStyle}">
                    <div id="helper--modal-mask" style="${maskStyle}"></div>
                    <div class="breadcrumb" style="${boxStyle}">
                        <div id="helper--modal-content" style="${contentStyle}">${content.join()}</div>
                        <button id="helper--modal-close" type="button" class="pcbtn mr-3"> 关闭 </button>
                    </div>
                </div>
            `;
            $("#app").after(html);
            $("#helper--modal-close").click(() => hideModal());
            $("#helper--modal-mask").click(() => hideModal());
        }

        function genItemsGroup(items) {
            const html = `
                <div class="d-flex flex-nowrap justify-content-center">
                    ${items.map(item => `
                        <div class="p-2 text-center mapDrop-item mr-2">
                            <a
                                href="${item.url}"
                                class=""
                                target="_blank"
                            >
                                <img
                                    width="70"
                                    title="${item.name}"
                                    src="${item.img}"
                                    class="aligncenter"
                                >
                            </a>
                            <h6 class="dropOdd text-center">${Math.round(item.odd * 100)}<span style="font-size: 12px;">%</span></h6>
                            <span class="oddTri"></span>
                            <span class="text-center py-1 d-block"> ${item.count} </span>
                        </div>
                    `).join()}
                </div>
            `;
            return html;
        }

        function genTable(mapData) {
            const bouns = getBouns();
            const html = `
                <table width="1000px" class="table table-bordered mapDrop-table helper">
                    <thead>
                        <th style="min-width: 67px; vertical-align: baseline;">章节</th>
                        <th style="min-width: 67px; vertical-align: baseline;">需求</th>
                        <th style="min-width: 67px; vertical-align: baseline;">效率</th>
                        <th style="min-width: 67px; vertical-align: baseline;">适用</th>
                        <th style="min-width: 67px; vertical-align: baseline;">推荐</th>
                        <th style="min-width: 67px; vertical-align: baseline;">最大</th>
                        <th> 掉落一覽 </th>
                    </thead>
                    <tbody>
                        ${mapData.map(m => `
                            <tr>
                                <td>
                                    <a href="#" class="helper--nav-to-level" data-page="${m.page}" data-index="${m.index}">
                                        ${m.name}
                                    </a>
                                </td>
                                <td> ${m.requirement} </td>
                                <td> ${Math.round(m.effective * 100)}% </td>
                                <td> ${Math.ceil(m.min / bouns)} </td>
                                <td> ${Math.ceil(m.times / bouns)} </td>
                                <td> ${Math.ceil(m.max / bouns)} </td>
                                <td align="center">
                                    ${genItemsGroup(m.items)}
                                </td>
                            </tr>
                        `).join()}
                    </tbody>
                </table>
            `.trim();
            const table = $.parseHTML(html).pop();  // 0是一堆逗号，我也不造这是什么鬼
            $(table).find("a.helper--nav-to-level").click(function(e) {
                const $this = $(e.currentTarget);
                const page = parseInt($this.attr("data-page"));
                const index = parseInt($this.attr("data-index"));
                hideModal();
                toPage(page);
                setTimeout(() => {
                    const $table = $(".mapDrop-table:not(.helper)");
                    const elem = $table.find("tr")[index];
                    elem.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                        inline: "center",
                    })
                }, 200)
            })
            return table
        }

        function hideModal() {
            $("#helper--modal").css("opacity", 0);
            $("#helper--modal").css("pointer-events", "none");
        }

        function showModal(...content) {
            $("#helper--modal").css("opacity", 1);
            $("#helper--modal").css("pointer-events", "");
            if (content.length) {
                $("#helper--modal-content").html(content.join());
            }
        }

        function showModalByDom(...dom) {
            $("#helper--modal").css("opacity", 1);
            $("#helper--modal").css("pointer-events", "");
            if (dom.length) {
                $("#helper--modal-content").html("");
                for(let i in dom)
                    $("#helper--modal-content").append(dom[i]);
            }
        }

        async function handleClickCalcBtn() {
            autoSwitch2MapList();
            await sleep(1000);
            const data = await getMapData();
            console.log("data", data);
            const result = calcResult(data);
            console.log("result", result);
            showResult(result);
        }

        function createBtn() {
            const calcBtn = $.parseHTML(`
                <div id="helper--calc-btn" class="armory-function scroll-fixed-bottom" style="right:130px; filter: hue-rotate(120deg);">
                    <button class="pcbtn primary"> 计算<br>结果 </button>
                </div>
            `);
            const bounsBtn = $.parseHTML(`
                <div id="helper--bouns-btn" class="armory-function scroll-fixed-bottom" style="right:200px; filter: hue-rotate(240deg);">
                    <button class="pcbtn primary"> 修改<br>倍数 </button>
                </div>
            `);
            $("#app .container").append(calcBtn);
            $("#app .container").append(bounsBtn);
            console.log($("#scroll-fixed-bottom").html());
            $("#helper--calc-btn").click(handleClickCalcBtn);
            $("#helper--bouns-btn").click(askBouns);
        }
        createBtn();
        createModal();
    });
})();
