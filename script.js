// ==UserScript==
// @name         图书馆辅助计算器
// @namespace    http://tampermonkey.net/
// @version      0.2.1
// @description  辅助计算所需体力，总次数等等
// @author       Winrey
// @license      MIT
// @updateURL    https://cdn.jsdelivr.net/gh/winrey/pcr-wiki-helper@master/script.js
// @downloadURL  https://cdn.jsdelivr.net/gh/winrey/pcr-wiki-helper@master/script.js
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

        async function getMapData() {
            function rowParser($tr) {
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
                return { name: name, requirement: requirement, items: items };
            }

            function next($table) {
                const $pages = $($table.find("tr").toArray().pop());
                const $next = $($pages.find("li").toArray().pop());
                if ($next.hasClass("disabled"))
                    return false;
                $next.children()[0].click()
                return true;
            }

            function toFrist($table) {
                const $pages = $($table.find("tr").toArray().pop());
                const $frist = $($pages.find("li").toArray()[1]);
                $frist.children()[0].click()
            }

            let $table = $(".mapDrop-table");
            const data = [];
            toFrist($table);
            await sleep(100);
            do {
                await sleep(100);
                $table = $(".mapDrop-table");
                const pageData = $table.find("tr")
                  .toArray()
                  .map($)
                  .slice(0,-1)  // 最后一行是分页栏
                  .map(rowParser);
                data.push.apply(data, pageData);
            } while(next($table))
            toFrist($table);
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
                    target.times = lp_result[k];
            }
            return {
                total: lp_result.result,
                map: data.sort((a, b) => (b.times || 0) - (a.times || 0))
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
            let bouns = getBouns();
            const lines = [];
            lines.push(`总体力需求：${Math.round(data.total / bouns)}`);
            lines.push("----------------");
            data.map.forEach(m => {
                lines.push(`关卡${m.name}  \t推荐次数：${Math.round((m.times || 0) / bouns)}  \t最大次数：${Math.round(m.max / bouns)}`);
            });
            alert(lines.join("\n"));
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

        function createBtn(){
            const calcBtn = $.parseHTML(
                '<div id="calc-btn" class="armory-function scroll-fixed-bottom" style="right:130px; filter: hue-rotate(120deg);"><button class="pcbtn primary"> 计算<br>结果 </button></div>'
            );
            const bounsBtn = $.parseHTML(
                '<div id="bouns-btn" class="armory-function scroll-fixed-bottom" style="right:200px; filter: hue-rotate(240deg);"><button class="pcbtn primary"> 修改<br>倍数 </button></div>'
            );
            $("#app .container").append(calcBtn);
            $("#app .container").append(bounsBtn);
            console.log($("#scroll-fixed-bottom").html());
            $("#calc-btn").click(handleClickCalcBtn);
            $("#bouns-btn").click(askBouns);
        }
        createBtn();
    });
})();
