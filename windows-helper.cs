// Fixed Windows operations for the native app. No shell, script evaluation or user-supplied commands.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing.Text;
using System.IO;
using System.Linq;
using System.Management;
using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Web.Script.Serialization;
using Windows.ApplicationModel;
using Windows.Management.Deployment;
using Windows.Storage;

internal static class PrismWindows {
    const string CodexFamily = "OpenAI.Codex_2p2nqsd0c76g0";
    const string PrismFamily = "Elkhalil.PrismforCodex_am6tt3k0e6k10";
    static string Profile { get { return Path.Combine(Packaged() ? ApplicationData.Current.LocalCacheFolder.Path : Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Prism\wallpaper-codex-profile"); } }
    static string Code = "helper-unavailable";
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    static void Require(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
    static bool Same(string a, string b) { return String.Equals(a, b, StringComparison.OrdinalIgnoreCase); }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr CommandLineToArgvW(string command, out int count);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern int GetCurrentPackageFullName(ref uint length, StringBuilder name);
    static string[] Arguments(string command) {
        Require(!String.IsNullOrWhiteSpace(command) && command.Length <= 32767, "The wallpaper session command line is unavailable.");
        int count; var memory = CommandLineToArgvW(command, out count);
        Require(memory != IntPtr.Zero, "The wallpaper session command line could not be parsed.");
        try { return Enumerable.Range(0, count).Select(i => Marshal.PtrToStringUni(Marshal.ReadIntPtr(memory, i * IntPtr.Size))).ToArray(); }
        finally { LocalFree(memory); }
    }
    internal static void VerifyProfile(string command, string expected) {
        var args = Arguments(command).Skip(1).TakeWhile(x => x != "--").ToArray();
        var profiles = args.Where(x => Same(x, "--user-data-dir") || x.StartsWith("--user-data-dir=", StringComparison.OrdinalIgnoreCase)).ToArray();
        var ports = args.Where(x => Same(x, "--remote-debugging-port") || x.StartsWith("--remote-debugging-port=", StringComparison.OrdinalIgnoreCase)).ToArray();
        Require(profiles.Length == 1 && profiles[0].StartsWith("--user-data-dir=", StringComparison.Ordinal), "The wallpaper session has no unique dedicated profile. Open Codex through Prism.");
        Require(ports.Length == 1 && ports[0] == "--remote-debugging-port=9339", "The wallpaper session has no unique expected debugging port. Open Codex through Prism.");
        Require(Same(profiles[0].Substring(16).TrimEnd('\\'), expected.TrimEnd('\\')), "The wallpaper session uses a different profile. Open Codex through Prism.");
    }
    internal static void VerifyListener(string address, int ownerCount, string ownerExecutable, string command, string executable, string profile) {
        Code = "unsafe-session";
        Require(address == "127.0.0.1", "No exclusively loopback wallpaper endpoint is available. Start a wallpaper session first.");
        Code = "port-in-use";
        Require(ownerCount == 1 && Same(ownerExecutable, executable), "The wallpaper endpoint is not owned by the expected official Codex process.");
        Code = "unsafe-session"; VerifyProfile(command, profile);
    }
    static bool Packaged() {
        uint length = 0; int result = GetCurrentPackageFullName(ref length, null);
        if (result == 15700) return false; // APPMODEL_ERROR_NO_PACKAGE
        Require(result == 122 && length > 0, "Windows package identity is unavailable.");
        Require(Package.Current.Id.FamilyName == PrismFamily, "This is not the expected Prism Store package.");
        return true;
    }
    static object Startup(string action) {
        Require(Packaged(), "Store startup requires the Prism Store package.");
        {
            var task = StartupTask.GetAsync("PrismStartup").AsTask().GetAwaiter().GetResult();
            if (action == "StartupEnable") {
                var state = task.RequestEnableAsync().AsTask().GetAwaiter().GetResult();
                Require(state == StartupTaskState.Enabled || state == StartupTaskState.EnabledByPolicy,
                    "Windows has disabled Prism startup. Enable Prism in Settings > Apps > Startup if your administrator permits it.");
            } else if (action == "StartupDisable") task.Disable();
            return task.State == StartupTaskState.Enabled || task.State == StartupTaskState.EnabledByPolicy;
        }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct TrustFile { public uint size; [MarshalAs(UnmanagedType.LPWStr)] public string path; public IntPtr file, subject; }
    [StructLayout(LayoutKind.Sequential)]
    struct TrustData {
        public uint size; public IntPtr callback, client; public uint ui, revocation, choice; public IntPtr file;
        public uint action; public IntPtr state, url; public uint flags, context; public IntPtr signature;
    }
    [DllImport("wintrust.dll", ExactSpelling = true)] static extern int WinVerifyTrust(IntPtr window, ref Guid action, ref TrustData data);
    internal static void VerifySignature(string path) {
        var file = new TrustFile { size = (uint)Marshal.SizeOf(typeof(TrustFile)), path = path };
        IntPtr pointer = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(TrustFile)));
        Marshal.StructureToPtr(file, pointer, false);
        var data = new TrustData { size = (uint)Marshal.SizeOf(typeof(TrustData)), ui = 2, revocation = 1, choice = 1, file = pointer, action = 1, flags = 0x80 };
        var action = new Guid("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");
        try {
            Require(WinVerifyTrust(new IntPtr(-1), ref action, ref data) == 0, "The expected signed OpenAI application could not be verified.");
            // WinVerifyTrust checks the primary embedded signature; inspect that same certificate.
            using (var cert = new X509Certificate2(X509Certificate.CreateFromSignedFile(path))) {
                Require(cert.SubjectName.Format(true).Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                    .Any(line => line.Trim() == "O=OpenAI OpCo, LLC" || line.Trim() == "O=\"OpenAI OpCo, LLC\""),
                    "The executable is not signed by OpenAI OpCo, LLC.");
            }
        } finally {
            data.action = 2; WinVerifyTrust(new IntPtr(-1), ref action, ref data);
            Marshal.DestroyStructure(pointer, typeof(TrustFile)); Marshal.FreeHGlobal(pointer);
        }
    }
    static List<Dictionary<string, object>> Query(string scope, string query) {
        using (var search = new ManagementObjectSearcher(scope, query))
        using (var results = search.Get()) {
            var rows = new List<Dictionary<string, object>>();
            foreach (ManagementObject result in results) using (result) {
                var row = new Dictionary<string, object>();
                foreach (PropertyData property in result.Properties) row[property.Name] = property.Value;
                rows.Add(row);
            }
            return rows;
        }
    }
    static List<Dictionary<string, object>> Listeners() {
        // Query errors must fail closed, never masquerade as an unused port.
        return Query(@"root\StandardCimv2", "SELECT LocalAddress, OwningProcess FROM MSFT_NetTCPConnection WHERE State=2 AND LocalPort=9339");
    }
    static void Start(string executable, string arguments, bool hidden) {
        Process.Start(new ProcessStartInfo(executable, arguments) { UseShellExecute = false, CreateNoWindow = hidden, WindowStyle = hidden ? ProcessWindowStyle.Hidden : ProcessWindowStyle.Normal });
    }
    static object Run(string action) {
        if (action == "Storage") return new { packaged = Packaged(), directory = Packaged() ? ApplicationData.Current.LocalFolder.Path : null };
        if (action == "Startup" || action == "StartupEnable" || action == "StartupDisable") return Startup(action);
        if (action == "TaskManager") { Start(Path.Combine(Environment.SystemDirectory, "Taskmgr.exe"), "", false); return new { opened = true }; }
        if (action == "Fonts") using (var fonts = new InstalledFontCollection()) return new { families = fonts.Families.Select(x => x.Name).Distinct().OrderBy(x => x).ToArray() };
        Require(new[] { "Inspect", "Verify", "Launch", "Show", "Settings" }.Contains(action), "Unknown Windows operation.");
        var packages = new PackageManager().FindPackagesForUser("").Where(x => x.Id.Name == "OpenAI.Codex").ToArray();
        Code = "codex-missing"; Require(packages.Length > 0, "The official Codex Windows app is not installed for this Windows user.");
        Code = "unsafe-install"; Require(packages.Length == 1 && packages[0].Id.FamilyName == CodexFamily, "The installed official Codex package could not be identified.");
        var package = packages[0]; var v = package.Id.Version;
        string version = String.Join(".", new[] { v.Major, v.Minor, v.Build, v.Revision });
        // Keep the version for diagnosis; the shared wallpaper adapter checks the live layout before applying.
        string location = package.InstalledLocation.Path, executable = Path.Combine(location, @"app\ChatGPT.exe");
        Code = "codex-missing"; Require(File.Exists(executable), "The installed official Codex executable could not be found.");
        Code = "unsafe-install"; VerifySignature(executable);
        var all = Query(@"root\cimv2", "SELECT ProcessId, ExecutablePath, CommandLine FROM Win32_Process WHERE Name='ChatGPT.exe'");
        string prefix = Path.Combine(Path.GetDirectoryName(location), "OpenAI.Codex_");
        var processes = all.Where(p => Same(p["ExecutablePath"] as string, executable) ||
            ((p["ExecutablePath"] as string ?? "").StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && (p["ExecutablePath"] as string).EndsWith(@"\app\ChatGPT.exe", StringComparison.OrdinalIgnoreCase))).ToArray();
        Code = "unsafe-session"; var listeners = Listeners();
        if (action == "Launch") {
            Code = "codex-open"; Require(processes.Length == 0, "Codex is still running as ChatGPT.exe. Save your work and choose Quit from its Windows tray icon. Prism will never force-close it.");
            Code = "port-in-use"; Require(listeners.Count == 0, "Wallpaper port 9339 is occupied. Nothing was started.");
            Directory.CreateDirectory(Profile);
            Start(executable, "--remote-debugging-address=127.0.0.1 --remote-debugging-port=9339 --user-data-dir=\"" + Profile + "\"", true);
            return new { launched = true, port = 9339 };
        }
        if (listeners.Count == 0) {
            Code = processes.Length > 0 ? "codex-open" : "codex-closed";
            Require(action == "Inspect", "No exclusively loopback wallpaper endpoint is available. Start a wallpaper session first.");
            int[] ids = processes.Select(p => Convert.ToInt32(p["ProcessId"])).ToArray();
            bool background = ids.Length > 0;
            foreach (int id in ids) try { using (var process = Process.GetProcessById(id)) if (process.MainWindowHandle != IntPtr.Zero) background = false; } catch { background = false; }
            return new { code = Code, detail = "", version = version, processIds = ids,
                mainProcessIds = processes.Where(p => !Arguments(p["CommandLine"] as string).Skip(1).Any(x => x.StartsWith("--type=", StringComparison.Ordinal))).Select(p => Convert.ToInt32(p["ProcessId"])).ToArray(), backgroundOnly = background };
        }
        Code = "unsafe-session";
        foreach (var listener in listeners) {
            var owner = Query(@"root\cimv2", "SELECT ExecutablePath, CommandLine FROM Win32_Process WHERE ProcessId=" + Convert.ToUInt32(listener["OwningProcess"]));
            VerifyListener(listener["LocalAddress"] as string, owner.Count, owner.Count == 1 ? owner[0]["ExecutablePath"] as string : null,
                owner.Count == 1 ? owner[0]["CommandLine"] as string : null, executable, Profile);
        }
        if (action == "Inspect") return new { code = "ready", detail = "", version = version };
        if (action == "Show" || action == "Settings") {
            Start(executable, "--user-data-dir=\"" + Profile + "\"" + (action == "Settings" ? " codex://settings" : ""), true);
            return new { opened = true };
        }
        return new { verified = true, version = version, port = 9339 };
    }
    [MTAThread]
    static int Main(string[] args) {
        string action = args.Length == 1 ? args[0] : "";
        try {
            if (args.Length == 0) { Require(Packaged(), "Startup activation requires the Prism Store package."); Start(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Prism.exe"), "--background", true); return 0; }
            Require(args.Length == 1, "Choose one Windows operation.");
            Console.SetOut(new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true });
            Console.WriteLine(Json.Serialize(Run(action))); return 0;
        } catch (Exception error) {
            Console.WriteLine(Json.Serialize(action == "Inspect" ? (object)new { code = Code, detail = error.Message } : new { code = Code, error = error.Message }));
            return action == "Inspect" ? 0 : 1;
        }
    }
}
