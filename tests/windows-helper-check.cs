using System;
using System.IO;

internal static class PrismWindowsTests {
    static void Reject(Action action, string name) {
        bool rejected = false;
        try { action(); } catch { rejected = true; }
        if (!rejected) throw new Exception("Accepted unsafe input: " + name);
    }
    static void Main() {
        string profile = @"C:\Users\Example Name\AppData\Local\Prism\wallpaper-codex-profile";
        string good = "app.exe --remote-debugging-port=9339 --user-data-dir=\"" + profile + "\"";
        PrismWindows.VerifyProfile(good, profile);
        PrismWindows.VerifyProfile(good + " --title=\"a harmless argument\"", profile);
        PrismWindows.VerifyProfile(good.ToLowerInvariant(), profile);
        foreach (string bad in new[] {
            "app.exe --title=\"--remote-debugging-port=9339 --user-data-dir=" + profile + "\"",
            "app.exe -- " + good.Substring(8),
            good + " --remote-debugging-port=9339", good + " --remote-debugging-port=9444",
            good + " --REMOTE-DEBUGGING-PORT=9339", good + " --remote-debugging-port 9339",
            good + " --user-data-dir=\"" + profile + "\"", good + " --user-data-dir C:\\Other",
            good.Replace("9339", "93390"), good.Replace("9339", "9444"),
            good.Replace("--user-data-dir=", "--user-data-dir "),
            good.Replace("--remote-debugging-port=", "--remote-debugging-port "),
            good.Replace(profile, profile + "-other"), good.Replace(profile, @"C:\Other"),
            null, "", new string('a', 32768)
        }) Reject(() => PrismWindows.VerifyProfile(bad, profile), bad ?? "null command line");
        string executable = @"C:\Program Files\WindowsApps\OpenAI.Codex_26.903.8094.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe";
        PrismWindows.VerifyListener("127.0.0.1", 1, executable, good, executable, profile);
        foreach (string address in new[] { "0.0.0.0", "::", "::1", "192.168.1.2", null })
            Reject(() => PrismWindows.VerifyListener(address, 1, executable, good, executable, profile), "nonexclusive loopback");
        Reject(() => PrismWindows.VerifyListener("127.0.0.1", 0, executable, good, executable, profile), "missing owner");
        Reject(() => PrismWindows.VerifyListener("127.0.0.1", 2, executable, good, executable, profile), "ambiguous owner");
        Reject(() => PrismWindows.VerifyListener("127.0.0.1", 1, @"C:\Other\ChatGPT.exe", good, executable, profile), "wrong owner executable");
        Reject(() => PrismWindows.VerifyListener("127.0.0.1", 1, executable, good.Replace(profile, @"C:\Other"), executable, profile), "wrong owner profile");
        Reject(() => PrismWindows.VerifySignature(System.Reflection.Assembly.GetExecutingAssembly().Location), "unsigned helper");
        Reject(() => PrismWindows.VerifySignature(Path.Combine(Environment.SystemDirectory, "Taskmgr.exe")), "Microsoft executable, not OpenAI");
        Console.WriteLine("PASS: exact Windows arguments, duplicate/decoy switches, profile bounds, loopback/owner validation and signer rejection.");
    }
}
