import {
  Alert02Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  BubbleChatIcon,
  Calendar01Icon,
  CallEnd01Icon,
  Cancel01Icon,
  Clock01Icon,
  Copy01Icon,
  FullScreenIcon,
  GoogleIcon,
  HappyIcon,
  Link01Icon,
  Loading03Icon,
  KeyboardIcon,
  Mail01Icon,
  MinimizeScreenIcon,
  MoreHorizontalIcon,
  Mic02Icon,
  MicOff02Icon,
  Moon02Icon,
  PinIcon,
  PlusSignIcon,
  ScreenShareIcon,
  SentIcon,
  Settings01Icon,
  ScreenShareOffIcon,
  Sun03Icon,
  Tick02Icon,
  UserMultipleIcon,
  Video01Icon,
  VideoOffIcon,
  WifiDisconnected01Icon,
  WifiFullSignalIcon,
  WifiLowSignalIcon,
  WifiMediumSignalIcon,
} from "@hugeicons/core-free-icons";

/**
 * The icon inventory from PRD.md §4.3, resolved against
 * @hugeicons/core-free-icons rather than guessed. Every export in this file was
 * verified to exist in the installed package.
 *
 * Two findings worth keeping:
 *
 *   Mic02Icon / MicOff02Icon, not the 01 pair. Mic01Icon is centred at x=11.5
 *   and MicOff01Icon at x=12 — half a unit apart, which reads as a jump when
 *   the control toggles. The 02 pair shares an identical stem path.
 *
 *   CrossIcon is a religious cross, not an X. Close is Cancel01Icon.
 *
 * The lucide-style aliases in v4 (ChevronDownIcon, TriangleAlertIcon) are the
 * same artwork under a second name — ChevronDownIcon is byte-identical to
 * ArrowDown01Icon. The HugeIcons-native names are used throughout so the
 * codebase reads consistently.
 */

export const ICONS = {
  micOn: { icon: Mic02Icon, export: "Mic02Icon", label: "Microphone on" },
  micOff: { icon: MicOff02Icon, export: "MicOff02Icon", label: "Microphone off" },
  cameraOn: { icon: Video01Icon, export: "Video01Icon", label: "Camera on" },
  cameraOff: { icon: VideoOffIcon, export: "VideoOffIcon", label: "Camera off" },
  screenShare: {
    icon: ScreenShareIcon,
    export: "ScreenShareIcon",
    label: "Share screen",
  },
  stopShare: {
    icon: ScreenShareOffIcon,
    export: "ScreenShareOffIcon",
    label: "Stop sharing",
  },
  /*
   * v1.2 F2. Not in §4.3's icon list, which predates the decision: fullscreen
   * is what makes a shared laptop screen readable on a phone — rotate and it
   * takes the whole viewport, which no amount of pinching inside a letterboxed
   * region recovers. Export names resolved against the installed package
   * rather than remembered.
   */
  fullscreen: {
    icon: FullScreenIcon,
    export: "FullScreenIcon",
    label: "View full screen",
  },
  exitFullscreen: {
    icon: MinimizeScreenIcon,
    export: "MinimizeScreenIcon",
    label: "Exit full screen",
  },
  chat: { icon: BubbleChatIcon, export: "BubbleChatIcon", label: "Chat" },
  participants: {
    icon: UserMultipleIcon,
    export: "UserMultipleIcon",
    label: "Participants",
  },
  reactions: { icon: HappyIcon, export: "HappyIcon", label: "Reactions" },
  leave: { icon: CallEnd01Icon, export: "CallEnd01Icon", label: "Leave" },
  copy: { icon: Copy01Icon, export: "Copy01Icon", label: "Copy" },
  link: { icon: Link01Icon, export: "Link01Icon", label: "Meeting link" },
  calendar: {
    icon: Calendar01Icon,
    export: "Calendar01Icon",
    label: "Calendar",
  },
  clock: { icon: Clock01Icon, export: "Clock01Icon", label: "Time" },
  plus: { icon: PlusSignIcon, export: "PlusSignIcon", label: "Add" },
  check: { icon: Tick02Icon, export: "Tick02Icon", label: "Done" },
  close: { icon: Cancel01Icon, export: "Cancel01Icon", label: "Close" },
  // v1.3 B2: the control bar's overflow, and what it opens. Resolved against
  // the installed package rather than guessed — CLAUDE.md's icon rule.
  more: {
    icon: MoreHorizontalIcon,
    export: "MoreHorizontalIcon",
    label: "More options",
  },
  settings: {
    icon: Settings01Icon,
    export: "Settings01Icon",
    label: "Audio and video settings",
  },
  keyboard: { icon: KeyboardIcon, export: "KeyboardIcon", label: "Keyboard" },
  // v1.3 C3: the composer's 44px send button, beside the field.
  send: { icon: SentIcon, export: "SentIcon", label: "Send message" },
  chevronDown: {
    icon: ArrowDown01Icon,
    export: "ArrowDown01Icon",
    label: "Chevron down",
  },
  chevronUp: {
    icon: ArrowUp01Icon,
    export: "ArrowUp01Icon",
    label: "Chevron up",
  },
  chevronLeft: {
    icon: ArrowLeft01Icon,
    export: "ArrowLeft01Icon",
    label: "Chevron left",
  },
  chevronRight: {
    icon: ArrowRight01Icon,
    export: "ArrowRight01Icon",
    label: "Chevron right",
  },
  alert: { icon: Alert02Icon, export: "Alert02Icon", label: "Alert" },
  signalFull: {
    icon: WifiFullSignalIcon,
    export: "WifiFullSignalIcon",
    label: "Connection excellent",
  },
  signalMedium: {
    icon: WifiMediumSignalIcon,
    export: "WifiMediumSignalIcon",
    label: "Connection good",
  },
  signalLow: {
    icon: WifiLowSignalIcon,
    export: "WifiLowSignalIcon",
    label: "Connection unstable",
  },
  signalLost: {
    icon: WifiDisconnected01Icon,
    export: "WifiDisconnected01Icon",
    label: "Connection lost",
  },
  pin: { icon: PinIcon, export: "PinIcon", label: "Pin" },
  google: { icon: GoogleIcon, export: "GoogleIcon", label: "Google" },
  mail: { icon: Mail01Icon, export: "Mail01Icon", label: "Email" },
  loading: { icon: Loading03Icon, export: "Loading03Icon", label: "Loading" },
  themeDark: { icon: Moon02Icon, export: "Moon02Icon", label: "Dark theme" },
  themeLight: { icon: Sun03Icon, export: "Sun03Icon", label: "Light theme" },
} as const;

export type IconKey = keyof typeof ICONS;
