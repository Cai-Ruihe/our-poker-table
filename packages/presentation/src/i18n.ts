import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Language = "en" | "zh";

const STORAGE_KEY = "our-poker-table.language";

const chinese: Readonly<Record<string, string>> = {
  "For the table already in front of you": "就从眼前这桌牌开始",
  "Deal cards. Keep poker yours.": "发牌交给我，牌局由你掌握",
  "Phones hold private cards. A tablet or TV shows the board. Chips and conversation stay on the physical table.":
    "手机只显示各自的私牌，平板或电视展示公共牌；筹码和交流，留在真实牌桌上。",
  "Trusted Host": "可信主机",
  "Create a table": "创建牌局",
  "Create table": "创建牌局",
  "This browser will shuffle, deal, and keep the authoritative hand history. It can read the active deck by design.":
    "这台设备负责洗牌、发牌并保存完整牌局记录。按照设计，可信主机可以查看当前牌组。",
  "Browser capability check": "浏览器能力检查",
  "Secure card and message cryptography": "安全的牌面与消息加密",
  "Durable table recovery": "可持久化的牌局恢复",
  "Nearby browser channel": "附近浏览器通道",
  "Isolated state projections": "隔离的状态视图",
  "Exclusive Trusted Host recovery": "可信主机独占恢复",
  "This browser cannot safely host a table. Open the HTTPS local preview in a current browser.":
    "当前浏览器无法安全地主持牌局，请使用最新版浏览器打开 HTTPS 页面。",
  "Physical chips": "实体筹码",
  "Deal-only mode. Players move chips on the table.":
    "仅负责发牌，玩家在真实牌桌上移动筹码。",
  "Digital chips · development tracer": "数字筹码 · 开发测试版",
  "Two players and one hand only; not party-ready.":
    "仅支持两名玩家和一手牌，暂不适合正式牌局。",
  "Experimental chip mode": "实验性筹码模式",
  "Starting stack": "起始筹码",
  "Small blind": "小盲注",
  "Big blind": "大盲注",
  "Connection Service host token": "连接服务主机令牌",
  "Used once to mint a table-limited relay ticket. It is not sent in player links.":
    "仅用于生成本桌专用的中继凭证，不会出现在玩家链接中。",
  "Preparing table…": "正在准备牌局…",
  "No account · no analytics · play chips only":
    "无需账户 · 不做分析 · 仅限娱乐筹码",
  "Join an Airplane table": "加入离线牌局",
  "Joining friends": "加入朋友的牌局",
  "Join another session": "加入另一桌牌局",
  "Paste the current invitation URL or scan its QR in this page.":
    "粘贴当前邀请链接，或在本页面扫描二维码。",
  "Invitation URL": "邀请链接",
  "Open invitation": "打开邀请链接",
  "Scan invitation QR": "扫描邀请二维码",
  "Create a table.": "创建牌局。",
  "Open Our Poker Table introduction": "打开 Our Poker Table 产品介绍",
  "Live camera": "实时相机",
  "Use a saved QR image": "使用已保存的二维码图片",
  "Nothing from the camera leaves this device.": "相机画面不会离开这台设备。",
  "Hold the QR inside the four corners.": "请将二维码放入四角框内。",
  "Close camera": "关闭相机",
  "Airplane pairing": "离线配对",
  Airplane: "离线",
  Pair: "配对",
  Scan: "扫描",
  "answer QR": "回应二维码",
  "invitation QR code": "邀请二维码",
  "invitation link": "邀请链接",
  "Community cards": "公共牌",
  "Player status around table": "牌桌周围的玩家状态",
  offline: "未连接",
  active: "进行中",
  folded: "已弃牌",
  "folded provisional": "待确认弃牌",
  mucked: "已弃牌",
  shown: "已亮牌",
  "sitting out": "暂不参加",
  waiting: "等待中",
  "shown cards": "已亮出的手牌",
  Seats: "座位",
  Seat: "座位",
  Dealer: "庄家",
  Stack: "筹码",
  "Cards not shown": "未亮出的手牌",
  "Digital chip accounting": "数字筹码记录",
  "In the middle": "底池",
  Pot: "底池",
  "This street": "本轮",
  "Current bet": "当前下注",
  "to act": "行动中",
  "Betting round closed": "本轮下注已结束",
  "Confirmed result": "已确认结果",
  "Host confirmation gate": "主机确认",
  "Settlement result": "结算结果",
  "Settlement proposal": "待确认结算",
  "Stacks reflect this confirmed result.": "筹码已按确认结果更新。",
  "Stacks update only after confirmation.": "确认后才会更新筹码。",
  "Total pot": "总底池",
  "This hand is complete.": "本手牌已结束。",
  "Deal next hand": "发下一手牌",
  "Review settlement": "查看结算",
  "Confirm settlement": "确认结算",
  "Players act from their phones.": "玩家请在自己的手机上操作。",
  "Confirm end hand": "确认结束本手牌",
  "Physical chips settled?": "实体筹码已结算？",
  "Keep playing": "继续牌局",
  "End this hand": "结束本手牌",
  "End hand": "结束本手牌",
  "Deal the flop": "发翻牌",
  "Deal the turn": "发转牌",
  "Deal the river": "发河牌",
  "Table style": "牌桌样式",
  "Deck appearance": "牌面样式",
  Classic: "经典",
  "Four Colour": "四色",
  "Host · this device": "主机 · 本机",
  "Table controls": "牌桌控制",
  "Close more controls": "关闭更多控制",
  "Invites, seat order, dealer, replacement": "邀请、座位顺序、庄家与设备替换",
  "Trusted Host only": "仅限可信主机",
  "Selected by the Trusted Host": "由可信主机选择",
  "Manage on this host": "在此主机上管理",
  "Local host active": "本地主机已启用",
  "Close table control center": "关闭牌桌控制中心",
  "Developer mode": "开发者模式",
  "The authoritative browser remains the source of truth":
    "可信主机仍是牌局状态的唯一依据",
  "Dissolve this table": "解散此牌局",
  "End the session for every connected display":
    "结束所有已连接显示设备的本次牌局",
  "Slide to show cards to table": "滑动向牌桌亮牌",
  "Your table status": "你的牌桌状态",
  "Unknown player": "未知玩家",
  "No blind position": "当前无盲注位置",
  "Your table state": "你的牌桌状态",
  "Seat unavailable": "座位暂不可用",
  "Your table position": "你的座位位置",
  "Your table": "你的牌桌",
  "Physical seat position": "实体座位位置",
  "Close your table position": "关闭座位位置",
  "Your highlighted seat follows the physical table order. Moving seats on the host changes this map, not the betting order.":
    "高亮座位对应实体牌桌顺序。主机调整座位时，只会更新此地图，不会改变下注顺序。",
  "Physical table": "实体牌桌",
  "Private hand": "私牌",
  "Shown to the table. Covering them here does not undo the show.":
    "已向牌桌亮牌；在此隐藏不会撤回亮牌。",
  "Visible only on this phone until you choose a table action.":
    "仅在这台手机上可见，直到你执行牌桌操作。",
  "Reveal them privately, then hide them before passing the phone.":
    "请先私下查看手牌，交出手机前记得隐藏。",
  "Fold undo window": "弃牌撤销时间",
  "Undo fold": "撤销弃牌",
  "Open leave options": "打开离开选项",
  "Leave options": "离开选项",
  "Close leave options": "关闭离开选项",
  "Open table control center": "打开牌桌控制中心",
  "Table tools": "牌桌工具",
  Players: "玩家",
  Developer: "开发",
  "Return to Host Controls": "返回主机控制",
  "Public table": "公共牌桌",
  "Shown hands are tied.": "已亮出的手牌并列领先。",
  "Best available shown hand is marked.": "已标出当前最佳已亮手牌。",
  "Dealer controls": "庄家控制",
  "Developer diagnostics": "开发者诊断",
  "Hand ID": "牌局编号",
  "No active hand": "当前没有进行中的手牌",
  "Hand complete": "本手牌完成",
  Flop: "翻牌",
  "Table ready": "牌桌已就绪",
  "Pre-flop": "翻牌前",
  River: "河牌",
  Showdown: "摊牌",
  "Settlement review": "结算审核",
  Turn: "转牌",
  "The display pairing QR could not be accepted.":
    "无法接受该显示设备配对二维码。",
  "Awkward-input display": "不便操作的显示设备",
  "Scan-pair a TV or public table": "扫描配对电视或公共牌桌",
  "The display chooses TV or Public Table first. Its one-use request QR grants nothing until you scan it here.":
    "显示设备先选择电视或公共牌桌。一次性请求二维码须由你在此扫描后才会生效。",
  paired: "已配对",
  "Reading QR…": "正在读取二维码…",
  "Scan display pairing QR": "扫描显示设备配对二维码",
  "Relay ticket expired": "中继凭证已过期",
  "Relay ticket expires in": "中继凭证剩余",
  minute: "分钟",
  minutes: "分钟",
  "The relay ticket could not be refreshed.": "无法刷新中继凭证。",
  "Connection Service": "连接服务",
  "Private relay": "私有中继",
  "Cloud relay": "云端中继",
  "Direct browser channel": "已连接",
  "Direct WebRTC": "直连 WebRTC",
  "Airplane · direct WebRTC": "离线模式 · 直连 WebRTC",
  "Refresh it before reconnecting a remote player after a long break.":
    "长时间暂停后，如需让远端玩家重新连接，请先刷新它。",
  "Relay ticket refreshed": "中继凭证已刷新",
  "Used only to renew this table ticket. It is not saved in table recovery or exposed in player links.":
    "仅用于续期本桌中继凭证；不会存入牌局恢复数据，也不会出现在玩家链接中。",
  "Refreshing…": "正在刷新…",
  "Refresh relay ticket": "刷新中继凭证",
  "The first player appears here as soon as the QR is redeemed.":
    "首位玩家兑换二维码后会显示在这里。",
  Open: "已开启",
  "Move anticlockwise": "逆时针移动",
  "Move clockwise": "顺时针移动",
  "Make dealer": "设为庄家",
  "Replace device": "更换设备",
  "Digital Chips void/rollback policy is not part of this tracer; the authority fails that command closed.":
    "数字筹码测试版暂不支持作废或回滚；主机会安全地拒绝该操作。",
  "Reason to void the active hand": "作废当前手牌的原因",
  "Void active hand": "作废当前手牌",
  "Event to annotate": "要标注的事件",
  "Correction note": "更正说明",
  "Append correction": "追加更正",
  "The table did not advance.": "牌局未能继续推进。",
  "Player administration": "玩家管理",
  "Off-table controls": "牌桌外控制",
  "Close player administration": "关闭玩家管理",
  "Pairing QR could not be rendered.": "无法生成配对二维码。",
  "Device replacement": "更换设备",
  "Other devices only": "仅供其他设备加入",
  Replace: "更换",
  device: "设备",
  "Add a player": "添加玩家",
  "Other devices join here": "其他设备从这里加入",
  "This one-use link keeps the seat and revokes its previous device when redeemed.":
    "此一次性链接会保留原座位，并在使用后撤销旧设备。",
  "Show this one-use QR or copy its link to the new player's device. They choose a display name after opening it; no account or host approval prompt follows.":
    "向新玩家展示一次性二维码或复制链接到其设备。打开后即可填写显示名称，无需账户或主机再次确认。",
  "Each QR works once. A player chooses their display name after opening it; no account or host approval prompt follows.":
    "每个二维码只能使用一次。玩家打开后填写显示名称，无需账户或主机再次确认。",
  "Using this phone or iPad as the host?": "正在用这台手机或 iPad 当主机？",
  "Choose Join my own table on this device above. Do not scan or open this invitation on the Trusted Host device.":
    "请使用上方“在本设备加入自己的牌局”。不要在可信主机设备上扫描或打开此邀请。",
  "Player replacement link": "玩家更换设备链接",
  "Player invitation link": "玩家邀请链接",
  "Return to new seats": "返回新增座位",
  "New invitation": "生成新邀请",
  "Encrypted recovery": "加密恢复",
  "Restoring this table": "正在恢复牌局",
  "Validating the last committed state and exclusive authority…":
    "正在验证最近一次已确认状态与独占主机权限…",
  "Recovery stopped safely": "已安全停止恢复",
  "This saved table cannot be opened": "无法打开这个已保存的牌局",
  "Return home": "返回首页",
  "Encrypted invitation": "加密邀请",
  Enlarged: "放大",
  "pairing QR": "配对二维码",
  "Do not use the phone's Camera app.": "请勿使用手机的系统相机应用。",
  "On the other device, open this same poker page and choose Join an Airplane table. Use its in-page camera—not the phone's standalone Camera app—then scan the answer here.":
    "请在另一台设备打开同一个牌局页面，选择“加入离线牌局”，使用页面内相机扫描回应码，不要使用手机系统相机。",
  "Creates a one-use, no-internet WebRTC offer. Both devices must use private Wi-Fi without client isolation.":
    "生成一次性、无需网络的 WebRTC 邀请。两台设备必须连接到未开启客户端隔离的私人 Wi-Fi。",
  "On the phone, open this poker app, choose Join an Airplane table, then use Scan host offer QR.":
    "请在手机打开本应用，选择“加入离线牌局”，再使用“扫描主机邀请”。",
  "Hold the phone steady and let this code fill the guide.":
    "请保持手机稳定，让二维码填满扫描框。",
  "Preparing…": "准备中…",
  "Prepare local pairing": "准备本地配对",
  "Scan this offer": "扫描这份配对邀请",
  "New offer": "生成新邀请",
  "Pair Player": "配对玩家",
  "Pair Public Table": "配对公共牌桌",
  "Pair TV": "配对电视",
  "Pair Tablet Control": "配对平板控制",
  "Scan Player answer QR": "扫描玩家回应二维码",
  "Direct channel paired. The other device can now join.":
    "直连通道已配对，另一台设备现在可以加入。",
  "New players": "新玩家",
  Locked: "已锁定",
  "Allow new players": "允许新玩家加入",
  "Stop new players": "停止新玩家加入",
  "Open join window": "打开加入窗口",
  "Close join window": "关闭加入窗口",
  "Player invitation": "玩家邀请",
  "All ten seats are allocated": "十个座位已全部分配",
  "Use player replacement from the roster if a phone changes.":
    "如果更换手机，请从玩家名单发起设备替换。",
  "Invite a player": "邀请玩家",
  "Copy link": "复制链接",
  Copied: "已复制",
  "Replace link": "更换链接",
  "Create Public Table link": "创建公共牌桌链接",
  "Create TV link": "创建电视链接",
  "Create Tablet Control link": "创建平板控制链接",
  "Public Table": "公共牌桌",
  "Tablet Control": "平板控制",
  "Dealer controls, never private cards": "可控制发牌，但不会看到私牌",
  "Public board and shown cards only": "仅显示公共牌和已亮出的牌",
  "Use this device as TV": "在本设备上使用电视模式",
  "Use this device as Tablet Control": "在本设备上使用平板控制",
  "Room surfaces": "牌桌显示设备",
  "Displays and dealer tablet": "显示屏与发牌平板",
  players: "名玩家",
  "Table positions": "座位位置",
  "Tap a player where they sit to manage that seat.":
    "点击玩家所在位置即可管理该座位。",
  "Active capabilities": "当前权限",
  "Displays and controls": "显示设备与控制权限",
  "No display or tablet is paired.": "尚未配对显示设备或平板。",
  Revoke: "撤销",
  "Append-only repair": "追加式修复",
  "Void and correction": "作废与更正",
  "Host also playing": "主机同时参与游戏",
  "Play on this device": "在本设备上参与游戏",
  "My display name": "我的显示名称",
  "Join my own table on this device": "在本设备加入自己的牌局",
  "Waiting for players": "等待玩家加入",
  "Join window": "加入窗口",
  "Deal first hand": "发第一手牌",
  "Dissolve table": "解散牌局",
  Appearance: "外观",
  "Table theme": "牌桌主题",
  "Synced to every phone and display at this table.":
    "同步到本桌所有手机和显示设备。",
  "Dark Green": "深绿色",
  "Black Gold": "黑金",
  "Deep Navy": "深海军蓝",
  "This device": "本设备",
  "Views and browser presentation": "视图与浏览器显示方式",
  "Host Controls": "主机控制",
  "My Hand": "我的手牌",
  "Table View": "牌桌视图",
  "Full screen": "全屏",
  "Show player names": "显示玩家姓名",
  "Hide player names": "隐藏玩家姓名",
  "Connection & recovery": "连接与恢复",
  "Table control center": "牌桌控制中心",
  "Players & seats": "玩家与座位",
  "Invites, seat order, dealer and replacement":
    "邀请、座位顺序、庄家与设备替换",
  "Displays & pairing": "显示设备与配对",
  "Tablet, TV and public table screens": "平板、电视与公共牌桌屏幕",
  "Table colour and deck on every screen": "所有屏幕上的牌桌颜色与牌面",
  "Catch up with the Trusted Host now": "立即与可信主机同步",
  "Diagnostics & history": "诊断与历史记录",
  "Privacy-filtered support evidence": "已过滤隐私的支持信息",
  "Save log": "保存日志",
  "Return to table": "返回牌桌",
  "Your cards": "你的手牌",
  "See your table position": "查看你的座位位置",
  "Reconnect to table": "重新连接牌桌",
  "Reconnecting…": "正在重新连接…",
  "Reconnecting to the table. Please wait.": "正在重新连接牌桌，请稍候。",
  "Change language": "切换语言",
  Playing: "游戏中",
  "Not connected": "未连接",
  "Sit out next hand": "下一手暂不参加",
  "Leave table permanently": "永久离开牌桌",
  "Permanent on this seat": "永久离开此座位",
  "Leave this table?": "要离开这桌牌局吗？",
  "This seat credential will be revoked and cannot reconnect. The host can keep the empty seat for history or replace its device.":
    "此座位凭证将被撤销，之后无法重新连接。主机可以保留空位记录，或为它更换设备。",
  "Stay at table": "留在牌桌",
  "Leaving…": "正在离开…",
  "Leave permanently": "永久离开",
  "Your name is only a label at this table. It is not an account.":
    "你的名字只是这桌牌局里的称呼，并不是账户。",
  "Taking seat…": "正在入座…",
  "Join table": "加入牌局",
  "Invitation unavailable": "邀请已失效",
  "This seat could not be opened": "无法打开这个座位",
  "Ask the host for a fresh player invitation.": "请向主机索取新的玩家邀请。",
  "Sitting out": "暂不参加",
  "Ready for next hand": "准备好下一手",
  "Waiting for the deal": "等待发牌",
  "Return for next hand": "参加下一手",
  "Refresh table status": "刷新牌局状态",
  "Up to 24 characters keeps the table display readable.":
    "最多 24 个字符，方便牌桌显示。",
  "Step away from the table": "暂时离开牌桌",
  "Player options": "玩家选项",
  Fold: "弃牌",
  "Show cards to table": "向牌桌亮牌",
  "Hide my cards": "隐藏我的手牌",
  "Reveal my cards privately": "私下查看我的手牌",
  "Only visible on this phone.": "仅在这台手机上可见。",
  "Player seat": "玩家座位",
  "Join this table": "加入这桌牌局",
  "Display name": "显示名称",
  "You have a seat": "你已获得座位",
  "Connecting to the table": "正在连接牌桌",
  "The public board will appear when the Trusted Host responds.":
    "可信主机响应后，公共牌面会显示在这里。",
  "Waiting for the host": "等待主机响应",
  "No internet mode": "无网络模式",
  "Show the answer to the host": "向主机展示回应码",
  "Scan the host offer": "扫描主机邀请",
  Cancel: "取消",
  "Connecting…": "正在连接…",
  "Join after host scans": "主机扫描后加入",
  "Pair as Public Table": "以公共牌桌配对",
  "Pair as TV": "以电视配对",
  "Pair this display": "配对这台显示设备",
  "Display pairing": "显示设备配对",
  "Table-side pairing": "桌边模式配对",
  "This room surface could not be opened": "无法打开此牌桌显示界面",
  "Ask the host for a fresh link.": "请向主机索取新的链接。",
  "No route reached the Trusted Host. This table link may be stale after the host or Connection Service restarted. Ask the Trusted Host to refresh the relay ticket and share a new link, or create a new table.":
    "无法连接到可信主机。主机或连接服务重启后，这个牌桌链接可能已失效。请让可信主机刷新中继凭证并分享新链接，或重新创建牌桌。",
  "Connection did not resume. Check the network and choose Reconnect to table.":
    "连接尚未恢复。请检查网络后，重新连接牌桌。",
  "Connection did not resume. Check the network and try again.":
    "连接尚未恢复。请检查网络后重试。",
  "The table did not respond.": "牌桌暂未响应，请稍后重试。",
  "The action was not accepted.": "此操作未被接受，请稍后重试。",
  "The seat could not be left safely.": "暂时无法安全离开牌桌，请稍后重试。",
  "Full screen was not accepted by this browser.":
    "浏览器未允许进入全屏模式，请稍后重试。",
  "The host scans this answer on their device. Then join over the direct local WebRTC channel.":
    "主机在其设备上扫描回应码后，即可通过本地 WebRTC 直连加入。",
  "Point this device's camera at the offer QR shown by the Trusted Host. It is decoded only on this device.":
    "请用本设备相机扫描可信主机展示的邀请二维码，二维码只会在本设备上解析。",
  "Scan host offer QR": "扫描主机邀请二维码",
  "Opens the camera": "打开相机",
  "Show this": "展示这份",
  request: "请求",
  "Show this short-lived request to the host. It can only become the role chosen below after the host scans it.":
    "请将这份限时请求展示给主机。主机扫描后，它才会成为下方所选的显示角色。",
  "Choose a public display role. A dealer tablet always needs its own explicit invitation.":
    "请选择公共显示角色。发牌平板始终需要单独的明确邀请。",
  "Waiting for the host scan": "等待主机扫描",
  Close: "关闭",
  "Language / 语言": "语言 / Language",
  "More table controls": "更多牌桌控制",
  "Close table controls": "关闭牌桌控制",
  "Next card": "下一张牌",
  "Board complete": "公共牌已完成",
  "Slide to deal next hand": "滑动发下一手牌",
  "Release to confirm": "松手确认",
  "Drag the gold handle to the arrow": "将金色滑块拖到箭头处",
  "Next hand": "下一手牌",
  "Slide · deal now": "滑动 · 立即发牌",
  "Slide · clear & deal": "滑动 · 结束并发牌",
  "Sit out skips the incoming hands while keeping your seat till you back.":
    "暂不参加接下来的牌局，回来后仍保留你的座位。",
  cards: "张牌",
  "one trusted host browser": "一个可信主机浏览器",
  "Digital chip settings": "数字筹码设置",
  "Use whole chips with 0 < small blind < big blind < starting stack.":
    "请输入整数，并满足 0 < 小盲注 < 大盲注 < 起始筹码。",
  "New players locked": "新玩家加入已锁定",
  "New seats are paused": "新座位暂时关闭",
  "This one-hand Digital Chips tracer does not admit late seats. Existing seat recovery and device replacement still work.":
    "数字筹码测试版只支持一手牌，不能中途加入；已有座位仍可恢复或更换设备。",
  "Allow new players to reveal a one-use QR and link. Existing seat recovery and device replacement still work.":
    "允许新玩家获取一次性二维码和链接；已有座位仍可恢复或更换设备。",
  "Existing seat recovery and device replacement still work.":
    "已有座位仍可恢复或更换设备。",
  "of 10 joined": "位玩家已加入",
  "Keep the Trusted Host running on this page. The controls above switch privately between Host Controls and My Hand; do not scan your own player QR.":
    "请保持可信主机在本页运行。上方控制仅在本机私下切换“主机控制”和“我的手牌”；请勿扫描自己的玩家二维码。",
  "New players who join after dealing wait for the next hand. Keep this browser open as the Trusted Host.":
    "发牌后加入的新玩家会从下一手开始；请保持此浏览器作为可信主机运行。",
  "Scan player invitation QR": "扫描玩家邀请二维码",
  "This device view": "本机视图",
  Table: "牌桌",
  "Physical Chips · deal-only mode.": "实体筹码 · 仅负责发牌。",
  "Deal when at least two player seats have joined.":
    "至少两位玩家入座后即可发牌。",
  "Committing first hand…": "正在发第一手牌…",
  Player: "玩家",
  TV: "电视",
  "Enlarge QR": "放大二维码",
  "Close enlarged QR": "关闭放大的二维码",
  "The local pairing offer could not be created.": "无法创建本地配对邀请。",
  "The local pairing answer was rejected.": "本地配对回应未被接受。",
};

export function translate(language: Language, english: string): string {
  return language === "zh" ? (chinese[english] ?? english) : english;
}

/**
 * Runtime errors originate below the presentation layer. Preserve a known,
 * useful explanation when it is translated; otherwise never expose an
 * untranslated implementation detail as a Chinese product message.
 */
export function localizeRuntimeError(
  language: Language,
  message: string,
): string {
  const localized = translate(language, message);
  if (language === "zh" && localized === message) {
    return "暂时无法完成此操作，请检查连接后重试。";
  }
  return localized;
}

function validLanguage(value: string | null | undefined): Language | undefined {
  return value === "en" || value === "zh" ? value : undefined;
}

export function languageFromNavigator(): Language {
  return globalThis.navigator?.language?.toLowerCase().startsWith("zh")
    ? "zh"
    : "en";
}

export function readStoredLanguage(): Language | undefined {
  try {
    return validLanguage(globalThis.localStorage.getItem(STORAGE_KEY));
  } catch {
    return undefined;
  }
}

export function languageFromUrl(rawUrl: string): Language | undefined {
  try {
    return validLanguage(
      new URL(rawUrl, globalThis.location.href).searchParams.get("lang"),
    );
  } catch {
    return undefined;
  }
}

export function persistLanguage(language: Language): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Private browsing/storage-restricted browsers still keep the live choice.
  }
}

export interface LanguageContextValue {
  readonly language: Language;
  readonly setLanguage: (language: Language) => void;
  readonly t: (english: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
);

export function LanguageProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof globalThis === "undefined") return "en";
    return (
      readStoredLanguage() ??
      languageFromUrl(globalThis.location.href) ??
      languageFromNavigator()
    );
  });
  const setLanguage = (next: Language) => {
    setLanguageState(next);
    persistLanguage(next);
  };
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-Hans" : "en";
  }, [language]);
  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (english) => translate(language, english),
    }),
    [language],
  );
  return createElement(LanguageContext.Provider, { value }, children);
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value)
    throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}

export function LanguageSwitch({
  compact = false,
}: {
  readonly compact?: boolean;
}) {
  const { language, setLanguage, t } = useLanguage();
  const button = (next: Language, label: string) =>
    createElement(
      "button",
      {
        "aria-pressed": language === next,
        className:
          language === next
            ? "button button--primary button--small"
            : "button button--quiet button--small",
        "data-language": next,
        onClick: () => setLanguage(next),
        type: "button",
      },
      label,
    );
  return createElement(
    "div",
    {
      "aria-label": t("Language / 语言"),
      className: compact
        ? "button-row language-switch language-switch--compact"
        : "button-row language-switch",
      "data-language-switch": true,
      role: "group",
    },
    button("en", "EN"),
    button("zh", "中文"),
  );
}
