import * as os from "os";
import * as vscode from 'vscode';
import { BinarySource } from "./installation/interfaces";

const RA_LSP_DEBUG = process.env.__RA_LSP_SERVER_DEBUG;

export interface CargoWatchOptions {
    enable: boolean;
    arguments: string[];
    command: string;
    allTargets: boolean;
}

export interface CargoFeatures {
    noDefaultFeatures: boolean;
    allFeatures: boolean;
    features: string[];
}
export class Config {
    private static readonly rootSection = "rust-analyzer";
    private static readonly requiresReloadOpts = [
        "cargoFeatures",
        "cargo-watch",
    ]
    .map(opt => `${Config.rootSection}.${opt}`);

    private cfg!: vscode.WorkspaceConfiguration;

    constructor(private readonly ctx: vscode.ExtensionContext) {
        vscode.workspace.onDidChangeConfiguration(this.onConfigChange, this, ctx.subscriptions);
        this.refreshConfig();
    }


    private refreshConfig() {
        this.cfg = vscode.workspace.getConfiguration(Config.rootSection);
        console.log("Using configuration:", this.cfg);
    }

    async onConfigChange(event: vscode.ConfigurationChangeEvent) {
        this.refreshConfig();

        const requiresReloadOpt = Config.requiresReloadOpts.find(
            opt => event.affectsConfiguration(opt)
        );

        if (!requiresReloadOpt) return;

        const userResponse = await vscode.window.showInformationMessage(
            `Changing "${requiresReloadOpt}" requires a reload`,
            "Reload now"
        );

        if (userResponse === "Reload now") {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
    }

    private static replaceTildeWithHomeDir(path: string) {
        if (path.startsWith("~/")) {
            return os.homedir() + path.slice("~".length);
        }
        return path;
    }

    /**
     * Name of the binary artifact for `ra_lsp_server` that is published for
     * `platform` on GitHub releases. (It is also stored under the same name when
     * downloaded by the extension).
     */
    private static prebuiltLangServerFileName(
        platform: NodeJS.Platform,
        arch: string
    ): null | string {
        // See possible `arch` values here:
        // https://nodejs.org/api/process.html#process_process_arch

        switch (platform) {

            case "linux": {
                switch (arch) {
                    case "arm":
                    case "arm64": return null;

                    default: return "ra_lsp_server-linux";
                }
            }

            case "darwin": return "ra_lsp_server-mac";
            case "win32":  return "ra_lsp_server-windows.exe";

            // Users on these platforms yet need to manually build from sources
            case "aix":
            case "android":
            case "freebsd":
            case "openbsd":
            case "sunos":
            case "cygwin":
            case "netbsd": return null;
            // The list of platforms is exhaustive (see `NodeJS.Platform` type definition)
        }
    }

    langServerBinarySource(): null | BinarySource {
        const langServerPath = RA_LSP_DEBUG ?? this.cfg.get<null | string>("raLspServerPath");

        if (langServerPath) {
            return {
                type: BinarySource.Type.ExplicitPath,
                path: Config.replaceTildeWithHomeDir(langServerPath)
            };
        }

        const prebuiltBinaryName = Config.prebuiltLangServerFileName(
            process.platform, process.arch
        );

        if (!prebuiltBinaryName) return null;

        return {
            type: BinarySource.Type.GithubRelease,
            dir:  this.ctx.globalStoragePath,
            file: prebuiltBinaryName,
            repo: {
                name: "rust-analyzer",
                owner: "rust-analyzer",
            }
        };
    }

    // We don't do runtime config validation here for simplicity. More on stackoverflow:
    // https://stackoverflow.com/questions/60135780/what-is-the-best-way-to-type-check-the-configuration-for-vscode-extension

    // FIXME: add codegen for primitive configurations
    highlightingOn()        { return this.cfg.get("highlightingOn") as boolean; }
    rainbowHighlightingOn() { return this.cfg.get("rainbowHighlightingOn") as boolean; }
    lruCapacity()           { return this.cfg.get("lruCapacity") as null | number; }
    displayInlayHints()     { return this.cfg.get("displayInlayHints") as boolean; }
    maxInlayHintLength()    { return this.cfg.get("maxInlayHintLength") as number; }
    excludeGlobs()          { return this.cfg.get("excludeGlobs") as string[]; }
    useClientWatching()     { return this.cfg.get("useClientWatching") as boolean; }
    featureFlags()          { return this.cfg.get("featureFlags") as Record<string, boolean>; }

    cargoWatchOptions(): CargoWatchOptions {
        return {
            enable:     this.cfg.get("cargo-watch.enable") as boolean,
            arguments:  this.cfg.get("cargo-watch.arguments") as string[],
            allTargets: this.cfg.get("cargo-watch.allTargets") as boolean,
            command:    this.cfg.get("cargo-watch.command") as string,
        };
    }

    cargoFeatures(): CargoFeatures {
        return {
            noDefaultFeatures: this.cfg.get("cargoFeatures.noDefaultFeatures") as boolean,
            allFeatures:       this.cfg.get("cargoFeatures.allFeatures") as boolean,
            features:          this.cfg.get("cargoFeatures.features") as string[],
        };
    }

    // for internal use
    withSysroot() { return this.cfg.get("withSysroot", false); }
}
