"use client";
// Phosphor Icons wrapper — replaces ALL Lucide imports in the project.
//
// Why Phosphor (not Lucide/Tabler/Heroicons):
// - 9000+ icons with 6 weights (thin/light/regular/bold/fill/duotone)
// - Distinctive, less overused in 2025-2026 AI projects (anti-AI design)
// - Variable weight allows expressive design at any size
// - Open source, MIT, well-maintained
//
// This file re-exports every icon we use, with compatible props
// (className, size). All other components import from this file instead
// of lucide-react.

import {
  Flame as PFlame,
  Bell as PBell,
  MapPin as PMapPin,
  MagnifyingGlass as PSearch,
  Funnel as PFilter,
  Sun as PSun,
  Moon as PMoon,
  CaretLeft as PCaretLeft,
  CaretRight as PCaretRight,
  CaretDown as PCaretDown,
  CaretUp as PCaretUp,
  CaretDoubleLeft as PCaretDoubleLeft,
  CaretDoubleRight as PCaretDoubleRight,
  X as PX,
  Play as PPlay,
  Pause as PPause,
  SkipBack as PSkipBack,
  SkipForward as PSkipForward,
  ArrowLineUp as PTrendingUp,
  Users as PUsers,
  AirplaneTilt as PPlane,
  Tree as PTree,
  Truck as PTruck,
  Wind as PWind,
  Drop as PDroplets,
  Thermometer as PThermometer,
  Clock as PClock,
  ShieldCheck as PShieldCheck,
  Warning as PWarning,
  WarningCircle as PWarningCircle,
  CheckCircle as PCheckCircle,
  RadioButton as PRadio,
  BookBookmark as PBookmark,
  GlobeHemisphereWest as PSatellite,
  Newspaper as PNewspaper,
  Lightning as PZap,
  Stack as PLayers,
  Translate as PLanguages,
  WifiHigh as PWifi,
  WifiSlash as PWifiOff,
  CircleNotch as PLoader2,
  ArrowsClockwise as PRefreshCw,
  Buildings as PBuilding2,
  Plus as PPlus,
  Minus as PMinus,
  Crosshair as PLocate,
  CornersOut as PMaximize2,
  PaperPlaneRight as PNavigation,
  ListBullets as PList,
  ClockCounterClockwise as PHistory,
  Pulse as PActivity,
  ShareNetwork as PShare2,
  Eye as PEye,
  ArrowSquareOut as PExternalLink,
  MagnifyingGlassMinus as PSearchX,
  MagnifyingGlassPlus as PMagnifyingGlassPlus,
  MagnifyingGlass as PMagnifyingGlass,
  ChartLine as PChartLine,
  ChartBar as PChartBar,
  ArrowCounterClockwise as PRotateCcw,
  Sliders as PSliders,
  Sparkle as PSparkles,
  House as PHome,
  Gear as PGear,
  Globe as PGlobe,
  Compass as PCompass,
  PushPin as PPushPin,
  Info as PInfo,
  Pencil as PEdit,
  Trash as PTrash,
  Cloud as PCloud,
  CloudRain as PCloudRain,
  CloudSun as PCloudSun,
  MapTrifold as PMap,
  GitBranch as PGitBranch,
  Heart as PHeart,
  Star as PStar,
  Brain as PBrain,
  Factory as PFactory,
  File as PFile,
  FileText as PFileText,
  Flag as PFlag,
  Lock as PLock,
  EnvelopeSimple as PMail,
  Phone as PPhone,
  MusicNotes as PMusic,
  Trophy as PTrophy,
  Umbrella as PUmbrella,
  Package as PPackage,
  Rocket as PRocket,
  Rss as PRss,
  Snowflake as PSnow,
  Wrench as PWrench,
  Siren as PSiren,
  Tag as PTag,
  Target as PTarget,
  Timer as PTimer,
  Toolbox as PToolbox,
  User as PUser,
  UserCircle as PUserCircle,
  UsersThree as PUsersThree,
  Watch as PWatch,
  SignIn as PSignIn,
  SignOut as PSignOut,
  Export as PExport,
  Copy as PCopy,
  Download as PDownload,
  Upload as PUpload,
  ThumbsUp as PThumbsUp,
  VideoCamera as PCamera,
  CurrencyEur as PCurrencyEur,
  CalendarBlank as PCalendar,
  Database as PDatabase,
  CheckSquare as PCheckSquare,
  DotsThree as PMoreHorizontal,
} from "@phosphor-icons/react";
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function makeIcon(PhosphorIcon: any) {
  return function Icon({ size = 18, className, ...rest }: IconProps) {
    return <PhosphorIcon size={size} weight="regular" className={className} {...rest} />;
  };
}

export const Flame = makeIcon(PFlame);
export const Bell = makeIcon(PBell);
export const MapPin = makeIcon(PMapPin);
export const Search = makeIcon(PSearch);
export const Filter = makeIcon(PFilter);
export const Funnel = makeIcon(PFilter);
export const Sun = makeIcon(PSun);
export const Moon = makeIcon(PMoon);
export const ChevronLeft = makeIcon(PCaretLeft);
export const ChevronRight = makeIcon(PCaretRight);
export const ChevronDown = makeIcon(PCaretDown);
export const ChevronUp = makeIcon(PCaretUp);
export const ChevronsLeft = makeIcon(PCaretDoubleLeft);
export const ChevronsRight = makeIcon(PCaretDoubleRight);
export const X = makeIcon(PX);
export const Play = makeIcon(PPlay);
export const Pause = makeIcon(PPause);
export const SkipBack = makeIcon(PSkipBack);
export const SkipForward = makeIcon(PSkipForward);
export const TrendingUp = makeIcon(PTrendingUp);
export const Users = makeIcon(PUsers);
export const Plane = makeIcon(PPlane);
export const Trees = makeIcon(PTree);
export const Truck = makeIcon(PTruck);
export const Wind = makeIcon(PWind);
export const Droplets = makeIcon(PDroplets);
export const Thermometer = makeIcon(PThermometer);
export const Clock = makeIcon(PClock);
export const ShieldCheck = makeIcon(PShieldCheck);
export const AlertTriangle = makeIcon(PWarning);
export const AlertCircle = makeIcon(PWarningCircle);
export const CheckCircle = makeIcon(PCheckCircle);
export const CheckCircle2 = makeIcon(PCheckCircle);
export const Radio = makeIcon(PRadio);
export const Bookmark = makeIcon(PBookmark);
export const Satellite = makeIcon(PSatellite);
export const Newspaper = makeIcon(PNewspaper);
export const Zap = makeIcon(PZap);
export const Layers = makeIcon(PLayers);
export const Languages = makeIcon(PLanguages);
export const Wifi = makeIcon(PWifi);
export const WifiOff = makeIcon(PWifiOff);
export const Loader2 = makeIcon(PLoader2);
export const RefreshCw = makeIcon(PRefreshCw);
export const Building2 = makeIcon(PBuilding2);
export const Plus = makeIcon(PPlus);
export const Minus = makeIcon(PMinus);
export const Locate = makeIcon(PLocate);
export const Maximize2 = makeIcon(PMaximize2);
export const Navigation = makeIcon(PNavigation);
export const List = makeIcon(PList);
export const History = makeIcon(PHistory);
export const Activity = makeIcon(PActivity);
export const Share2 = makeIcon(PShare2);
export const Eye = makeIcon(PEye);
export const ExternalLink = makeIcon(PExternalLink);
export const SearchX = makeIcon(PSearchX);
export const MagnifyingGlass = makeIcon(PMagnifyingGlass);
export const ChartLine = makeIcon(PChartLine);
export const ChartBar = makeIcon(PChartBar);
export const RotateCcw = makeIcon(PRotateCcw);
export const ArrowCounterClockwise = makeIcon(PRotateCcw);
export const Sliders = makeIcon(PSliders);
export const SlidersHorizontal = makeIcon(PSliders);
export const Sparkles = makeIcon(PSparkles);
export const Home = makeIcon(PHome);
export const Settings = makeIcon(PGear);
export const Globe = makeIcon(PGlobe);
export const Compass = makeIcon(PCompass);
export const PushPin = makeIcon(PPushPin);
export const Info = makeIcon(PInfo);
export const Edit = makeIcon(PEdit);
export const Trash = makeIcon(PTrash);
export const Cloud = makeIcon(PCloud);
export const CloudRain = makeIcon(PCloudRain);
export const CloudSun = makeIcon(PCloudSun);
export const MapIcon = makeIcon(PMap);
export const MapTrifold = makeIcon(PMap);
export const Map = makeIcon(PMap);
export const GitBranch = makeIcon(PGitBranch);
export const Heart = makeIcon(PHeart);
export const Star = makeIcon(PStar);
export const Brain = makeIcon(PBrain);
export const Factory = makeIcon(PFactory);
export const File = makeIcon(PFile);
export const FileText = makeIcon(PFileText);
export const Flag = makeIcon(PFlag);
export const Lock = makeIcon(PLock);
export const Mail = makeIcon(PMail);
export const Phone = makeIcon(PPhone);
export const Trophy = makeIcon(PTrophy);
export const Umbrella = makeIcon(PUmbrella);
export const Package = makeIcon(PPackage);
export const Rocket = makeIcon(PRocket);
export const Rss = makeIcon(PRss);
export const Snow = makeIcon(PSnow);
export const Wrench = makeIcon(PWrench);
export const Siren = makeIcon(PSiren);
export const Tag = makeIcon(PTag);
export const Target = makeIcon(PTarget);
export const Timer = makeIcon(PTimer);
export const Toolbox = makeIcon(PToolbox);
export const User = makeIcon(PUser);
export const UserCircle = makeIcon(PUserCircle);
export const UsersThree = makeIcon(PUsersThree);
export const Watch = makeIcon(PWatch);
export const Stop = makeIcon(PCamera);
export const ThumbsUp = makeIcon(PThumbsUp);
export const Camera = makeIcon(PCamera);
export const Coin = makeIcon(PCurrencyEur);
export const CurrencyEur = makeIcon(PCurrencyEur);
export const Calendar = makeIcon(PCalendar);
export const Database = makeIcon(PDatabase);
export const Download = makeIcon(PDownload);
export const Upload = makeIcon(PUpload);
export const CheckSquare = makeIcon(PCheckSquare);
export const Copy = makeIcon(PCopy);
export const SignIn = makeIcon(PSignIn);
export const SignOut = makeIcon(PSignOut);
export const Export = makeIcon(PExport);
export const MoreHorizontal = makeIcon(PMoreHorizontal);

// Backward-compat aliases
export const SearchIcon = Search;
export const BellIcon = Bell;
export const XIcon = X;
export const HistoryIcon = History;
export const ListIcon = List;
export const FilterIcon = Filter;
export const LayersIcon = Layers;
export const FlameIcon = Flame;
export const Flashlight = Flame;
export const FlashlightIcon = Flame;
