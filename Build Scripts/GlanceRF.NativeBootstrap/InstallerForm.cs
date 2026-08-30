using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Windows.Forms;

namespace GlanceRF.NativeBootstrap;

// ZIP URLs must stay aligned with Single Installers/*.ps1, *-Install-*.sh, and Scripts/Build_Standalone_Install_Exe.ps1 header.
internal sealed class InstallerForm : Form
{
#if GLANCERF_BOOTSTRAP_DEV
    private const string ZipUrl = "https://github.com/pomtom44/GlanceRF_Dev/archive/refs/heads/main.zip";
    private const string DialogCaption = "GlanceRF Setup DEV";
    private const string WelcomeWizardTitle = "Welcome to the GlanceRF (DEV) Setup Wizard";
    private const string WelcomeBody =
        "This installer downloads the latest sources from GitHub,\r\n" +
        "Extracts them to the folder you choose,\r\n" +
        "Then starts the version specific installer.\r\n\r\n" +
        "Click Next to continue.";
    private const string DestinationHelp =
        "Setup will download and extract into the folder below.\r\n" +
        "If the folder does not exist, it will be created.";
    private const string DefaultInstallFolderName = "GlanceRF-Dev";
    private const string DownloadProgressMessage = "Downloading GlanceRF Dev package from GitHub…";
    private const string HttpUserAgent = "GlanceRF-dev-installer/1.0 (Windows native bootstrap)";
#else
    private const string ZipUrl = "https://github.com/pomtom44/GlanceRF/archive/refs/heads/main.zip";
    private const string DialogCaption = "GlanceRF Setup";
    private const string WelcomeWizardTitle = "Welcome to the GlanceRF Setup Wizard";
    private const string WelcomeBody =
        "This installer downloads the latest sources from GitHub,\r\n" +
        "Extracts them to the folder you choose,\r\n" +
        "Then starts the version specific installer.\r\n\r\n" +
        "Click Next to continue.";
    private const string DestinationHelp =
        "Setup will download and extract into the folder below.\r\n" +
        "If the folder does not exist, it will be created.";
    private const string DefaultInstallFolderName = "GlanceRF";
    private const string DownloadProgressMessage = "Downloading GlanceRF package from GitHub…";
    private const string HttpUserAgent = "GlanceRF-installer/1.0 (Windows native bootstrap)";
#endif

    private sealed class InstallProgressReport
    {
        public InstallProgressReport(int percent, string message, ProgressBarStyle style)
        {
            Percent = percent;
            Message = message;
            Style = style;
        }

        public int Percent { get; }
        public string Message { get; }
        public ProgressBarStyle Style { get; }
    }

    private readonly Panel _header;
    private readonly Label _headerTitle;

    private readonly Panel _contentHost;
    private readonly Panel _welcomePage;
    private readonly Panel _destinationPage;
    private readonly Panel _readyPage;

    private readonly Label _welcomeTitle;
    private readonly TextBox _welcomeBody;

    private readonly Label _destinationHelp;
    private readonly TextBox _installPath;
    private readonly Button _browseButton;

    private readonly Label _statusLabel;
    private readonly ProgressBar _progress;

    private readonly Panel _footerDivider;
    private readonly FlowLayoutPanel _footerButtons;
    private readonly Button _btnBack;
    private readonly Button _btnNext;
    private readonly Button _btnCancel;

    private int _pageIndex;
    private bool _installing;
    private BackgroundWorker _installWorker;

    public InstallerForm()
    {
        Text = DialogCaption;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ClientSize = new Size(520, 400);
        BackColor = Color.FromArgb(240, 240, 240);
        Font = new Font("Segoe UI", 9F);

        _header = new Panel
        {
            Location = new Point(0, 0),
            Size = new Size(ClientSize.Width, 46),
            BackColor = Color.FromArgb(0, 102, 204),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
        };

        _headerTitle = new Label
        {
            AutoSize = false,
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 16F, FontStyle.Bold),
            Location = new Point(16, 8),
            Size = new Size(_header.Width - 32, 30),
            Text = DialogCaption
        };
        _header.Controls.Add(_headerTitle);

        Controls.Add(_header);

        _contentHost = new Panel
        {
            Location = new Point(0, _header.Bottom),
            Size = new Size(ClientSize.Width, ClientSize.Height - _header.Height - 52),
            BackColor = Color.White,
            Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right
        };
        Controls.Add(_contentHost);

        _welcomePage = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.White,
            Padding = new Padding(18)
        };

        // Dock Top + AutoSize on Labels often reserves the wrong height; the Fill body then starts at Y=0
        // and the title paints on top (body looks "hidden"). Use a fixed measured height instead.
        _welcomeTitle = new Label
        {
            Dock = DockStyle.Top,
            AutoSize = false,
            Padding = new Padding(0, 0, 0, 10),
            Text = WelcomeWizardTitle,
            Font = new Font("Segoe UI", 12F, FontStyle.Bold),
            ForeColor = Color.FromArgb(30, 30, 30)
        };

        // Use a read-only TextBox instead of a Label so multi-line explanatory text wraps reliably
        // (WinForms Labels frequently clip unless you carefully manage AutoSize/MaximumSize).
        _welcomeBody = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ReadOnly = true,
            TabStop = false,
            ShortcutsEnabled = false,
            HideSelection = true,
            BorderStyle = BorderStyle.None,
            BackColor = Color.White,
            ForeColor = Color.FromArgb(60, 60, 60),
            Font = new Font("Segoe UI", 9F),
            Text = WelcomeBody
        };

        // Dock order: add Fill first, then Top, so the layout engine reserves the title strip then gives the rest to the body.
        _welcomePage.Controls.Add(_welcomeBody);
        _welcomePage.Controls.Add(_welcomeTitle);
        _welcomePage.SizeChanged += (_, _) => LayoutWelcomeBody();

        _destinationPage = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.White,
            Padding = new Padding(18)
        };

        _destinationHelp = new Label
        {
            Dock = DockStyle.Top,
            Height = 56,
            Text = DestinationHelp,
            ForeColor = Color.FromArgb(60, 60, 60)
        };

        _installPath = new TextBox
        {
            Width = 330,
            Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                DefaultInstallFolderName)
        };
        _installPath.TextChanged += (_, _) => UpdateWizardChrome();

        _browseButton = new Button
        {
            Text = "Browse…",
            AutoSize = true
        };
        _browseButton.Click += (_, _) => BrowseInstallPath();

        _destinationPage.Padding = new Padding(18);

        var pathPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 64,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoSize = false,
            BackColor = Color.White
        };

        var installToLabel = new Label
        {
            AutoSize = true,
            Text = "Install to:",
            ForeColor = Color.FromArgb(60, 60, 60),
            Margin = new Padding(0, 0, 0, 6)
        };

        var pathInner = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            AutoSize = true,
            BackColor = Color.White
        };
        _installPath.Margin = new Padding(0, 2, 8, 0);
        _browseButton.Margin = new Padding(0, 0, 0, 0);
        pathInner.Controls.Add(_installPath);
        pathInner.Controls.Add(_browseButton);

        pathPanel.Controls.Add(installToLabel);
        pathPanel.Controls.Add(pathInner);

        // Dock order matters: help text first, then the path row.
        _destinationPage.Controls.Add(_destinationHelp);
        _destinationPage.Controls.Add(pathPanel);

        _readyPage = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.White,
            Padding = new Padding(18)
        };

        _statusLabel = new Label
        {
            Dock = DockStyle.Top,
            Height = 44,
            ForeColor = Color.FromArgb(0, 70, 160),
            Text = ""
        };

        _progress = new ProgressBar
        {
            Dock = DockStyle.Top,
            Height = 22,
            Style = ProgressBarStyle.Continuous,
            Minimum = 0,
            Maximum = 100,
            Value = 0,
            MarqueeAnimationSpeed = 30,
            Visible = false
        };

        // Dock order matters: status first, then progress.
        _readyPage.Controls.Add(_statusLabel);
        _readyPage.Controls.Add(_progress);

        _contentHost.Controls.Add(_welcomePage);

        _footerDivider = new Panel
        {
            Height = 1,
            Location = new Point(0, ClientSize.Height - 52),
            Size = new Size(ClientSize.Width, 1),
            BackColor = Color.FromArgb(210, 210, 210),
            Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right
        };
        Controls.Add(_footerDivider);

        _footerButtons = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            AutoSize = false,
            Location = new Point(0, ClientSize.Height - 48),
            Size = new Size(ClientSize.Width, 44),
            Padding = new Padding(12, 8, 12, 8),
            Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right
        };

        _btnCancel = new StandardWizardButton { Text = "Cancel", AutoSize = true };
        _btnCancel.Click += (_, _) => RequestCancelOrClose();

        _btnNext = new StandardWizardButton { Text = "Next >", AutoSize = true };
        _btnNext.Click += (_, _) => GoNext();

        _btnBack = new StandardWizardButton { Text = "< Back", AutoSize = true, Enabled = false };
        _btnBack.Click += (_, _) => GoBack();

        _footerButtons.Controls.Add(_btnCancel);
        _footerButtons.Controls.Add(_btnNext);
        _footerButtons.Controls.Add(_btnBack);

        Controls.Add(_footerButtons);

        Resize += (_, _) =>
        {
            _header.Size = new Size(ClientSize.Width, 46);
            _headerTitle.Width = _header.Width - 32;

            _contentHost.Location = new Point(0, _header.Bottom);
            _contentHost.Size = new Size(ClientSize.Width, ClientSize.Height - _header.Height - 52);

            _footerDivider.Location = new Point(0, ClientSize.Height - 52);
            _footerDivider.Width = ClientSize.Width;

            _footerButtons.Location = new Point(0, ClientSize.Height - 48);
            _footerButtons.Width = ClientSize.Width;

            LayoutInstallPathWidth();
            LayoutWelcomeBody();
        };

        TrySetWindowIcon();
        FormClosing += InstallerForm_FormClosing;
        ShowPage(0);
        UpdateWizardChrome();
        LayoutInstallPathWidth();
        LayoutWelcomeBody();
    }

    private void InstallerForm_FormClosing(object sender, FormClosingEventArgs e)
    {
        if (!_installing)
        {
            return;
        }

        if (_installWorker is { IsBusy: true })
        {
            try
            {
                _installWorker.CancelAsync();
            }
            catch
            {
                // ignore
            }
        }
    }

    private void RequestCancelOrClose()
    {
        if (_installing)
        {
            var r = MessageBox.Show(this,
                "Cancel setup?\r\n\r\nThis will stop the download/extract step.",
                DialogCaption,
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);
            if (r != DialogResult.Yes)
            {
                return;
            }

            try
            {
                _installWorker?.CancelAsync();
            }
            catch
            {
                // ignore
            }

            return;
        }

        Close();
    }

    private void LayoutWelcomeBody()
    {
        try
        {
            if (_welcomePage == null || _welcomeBody == null || _welcomeTitle == null)
            {
                return;
            }

            var maxWidth = Math.Max(1, _welcomePage.ClientSize.Width - _welcomePage.Padding.Horizontal);
            _welcomeTitle.MaximumSize = new Size(maxWidth, 2000);
            _welcomeTitle.Width = maxWidth;

            var titleText = _welcomeTitle.Text ?? "";
            var titleH = TextRenderer.MeasureText(
                    titleText,
                    _welcomeTitle.Font,
                    new Size(maxWidth, int.MaxValue),
                    TextFormatFlags.WordBreak | TextFormatFlags.TextBoxControl)
                .Height;
            _welcomeTitle.Height = Math.Max(28, titleH + _welcomeTitle.Padding.Vertical);

            // Keep a comfortable minimum height; grow if the wrapped text needs more room.
            var text = _welcomeBody.Text ?? "";
            var paddingHeight = _welcomeBody.Margin.Vertical + 6;
            var h = TextRenderer.MeasureText(
                    text,
                    _welcomeBody.Font,
                    new Size(maxWidth, int.MaxValue),
                    TextFormatFlags.WordBreak | TextFormatFlags.TextBoxControl).Height
                + paddingHeight;

            h = Math.Max(120, h);
            _welcomeBody.MinimumSize = new Size(0, h);
        }
        catch
        {
            // ignore layout failures during early initialization
        }
    }

    private void LayoutInstallPathWidth()
    {
        // Keep the path field comfortably wide like classic installers.
        var desired = ClientSize.Width - 190;
        if (desired < 260)
        {
            desired = 260;
        }

        _installPath.Width = desired;
    }

    private void BrowseInstallPath()
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "Select GlanceRF install folder",
            SelectedPath = _installPath.Text
        };

        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            _installPath.Text = dialog.SelectedPath;
        }
    }

    private void TrySetWindowIcon()
    {
        try
        {
            var exePath = Application.ExecutablePath;
            if (string.IsNullOrWhiteSpace(exePath) || !File.Exists(exePath))
            {
                return;
            }

            var icon = Icon.ExtractAssociatedIcon(exePath);
            if (icon != null)
            {
                Icon = icon;
            }
        }
        catch
        {
            // ignore
        }
    }

    private void ShowPage(int index)
    {
        _pageIndex = index;
        _contentHost.Controls.Clear();

        switch (index)
        {
            case 0:
                _contentHost.Controls.Add(_welcomePage);
                LayoutWelcomeBody();
                break;
            case 1:
                _contentHost.Controls.Add(_destinationPage);
                break;
            case 2:
                _contentHost.Controls.Add(_readyPage);
                break;
        }
    }

    private string GetResolvedInstallDir()
    {
        var installDir = Environment.ExpandEnvironmentVariables(_installPath.Text.Trim());
        if (string.IsNullOrWhiteSpace(installDir))
        {
            return "";
        }

        if (!Path.IsPathRooted(installDir))
        {
            installDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), installDir);
        }

        return installDir;
    }

    private void UpdateWizardChrome()
    {
        _btnBack.Enabled = !_installing && _pageIndex > 0;
        _btnNext.Visible = !_installing && _pageIndex < 2;

        _btnNext.Enabled = !_installing && CanGoNextFromCurrentPage();
    }

    private bool CanGoNextFromCurrentPage()
    {
        if (_pageIndex == 1)
        {
            return !string.IsNullOrWhiteSpace(GetResolvedInstallDir());
        }

        return true;
    }

    private void GoNext()
    {
        if (_pageIndex >= 2)
        {
            return;
        }

        if (_pageIndex == 1)
        {
            var dir = GetResolvedInstallDir();
            if (string.IsNullOrWhiteSpace(dir))
            {
                MessageBox.Show(this, "Please choose an install location.", DialogCaption, MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            ShowPage(2);
            UpdateWizardChrome();
            StartInstall();
            return;
        }

        ShowPage(_pageIndex + 1);
        UpdateWizardChrome();
    }

    private void GoBack()
    {
        if (_installing)
        {
            return;
        }

        if (_pageIndex <= 0)
        {
            return;
        }

        ShowPage(_pageIndex - 1);
        UpdateWizardChrome();
    }

    private void StartInstall()
    {
        var installDir = GetResolvedInstallDir();
        if (string.IsNullOrWhiteSpace(installDir))
        {
            MessageBox.Show(this, "Please choose an install location.", DialogCaption, MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        if (_installWorker is { IsBusy: true })
        {
            return;
        }

        _installing = true;
        SetWizardBusy(true);

        _progress.Visible = true;
        _progress.Style = ProgressBarStyle.Continuous;
        _progress.MarqueeAnimationSpeed = 0;
        _progress.Value = 0;
        _statusLabel.Text = "Preparing…";

        _installWorker = new BackgroundWorker
        {
            WorkerReportsProgress = true,
            WorkerSupportsCancellation = true
        };

        _installWorker.DoWork += (_, args) =>
        {
            void Report(int percent, string message, ProgressBarStyle style)
            {
                if (_installWorker.CancellationPending)
                {
                    args.Cancel = true;
                    return;
                }

                _installWorker.ReportProgress(percent, new InstallProgressReport(percent, message, style));
            }

            string dir = null;
            try
            {
                dir = (string)args.Argument!;
                Directory.CreateDirectory(dir);

                var zipPath = Path.Combine(dir, "glancerf.zip");
                Report(0, DownloadProgressMessage, ProgressBarStyle.Continuous);
                DownloadFileWithProgress(ZipUrl, zipPath, _installWorker, args);

                if (args.Cancel)
                {
                    return;
                }

                Report(100, "Extracting package…", ProgressBarStyle.Marquee);
                var extractRoot = Path.Combine(dir, "_extract_tmp");
                if (Directory.Exists(extractRoot))
                {
                    Directory.Delete(extractRoot, true);
                }

                Directory.CreateDirectory(extractRoot);
                ZipFile.ExtractToDirectory(zipPath, extractRoot);
                // Archive is fully expanded; remove the zip to save disk space before moving files.
                TryDelete(zipPath);

                // GitHub zip expands to a single top-level folder; move its contents up to install root.
                var top = Directory.EnumerateFileSystemEntries(extractRoot).ToList();
                if (top.Count == 1 && Directory.Exists(top[0]))
                {
                    var innerRoot = new DirectoryInfo(top[0]);
                    foreach (var item in innerRoot.EnumerateFileSystemInfos())
                    {
                        if (_installWorker.CancellationPending)
                        {
                            args.Cancel = true;
                            return;
                        }

                        var destinationPath = Path.Combine(dir, item.Name);
                        if (File.Exists(destinationPath))
                        {
                            File.Delete(destinationPath);
                        }
                        else if (Directory.Exists(destinationPath))
                        {
                            Directory.Delete(destinationPath, true);
                        }

                        if (item is DirectoryInfo)
                        {
                            Directory.Move(item.FullName, destinationPath);
                        }
                        else
                        {
                            File.Move(item.FullName, destinationPath);
                        }
                    }

                    TryDeleteDirectory(innerRoot.FullName);
                }
                else
                {
                    throw new InvalidOperationException("Unexpected archive layout (missing single top-level folder).");
                }

                TryDeleteDirectory(extractRoot);

                var innerProject = FindProjectInner(dir);
                if (innerProject == null)
                {
                    throw new InvalidOperationException(
                        "Could not find a valid GlanceRF project layout in the extracted archive. " +
                        "Expected a folder containing run.py, a glancerf package directory, and " +
                        "installers/install-windows.ps1 or installers/GlanceRF-Install-Windows.exe.");
                }

                Report(100, "Organizing files…", ProgressBarStyle.Marquee);
                MoveProjectToRoot(innerProject, dir);

                // Second attempt if the post-extract delete hit a transient lock (TryDelete is silent on failure).
                TryDelete(zipPath);

                var installersDir = Path.Combine(dir, "installers");
                var launchExe = Path.Combine(installersDir, "GlanceRF-Install-Windows.exe");
                var launchPs = Path.Combine(installersDir, "install-windows.ps1");

                if (!File.Exists(launchExe) && !File.Exists(launchPs))
                {
                    throw new InvalidOperationException("Could not find GlanceRF installer files after extraction.");
                }

                Report(100, "Starting the GlanceRF installer…", ProgressBarStyle.Marquee);
                if (File.Exists(launchExe))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = launchExe,
                        WorkingDirectory = installersDir,
                        UseShellExecute = true
                    });
                }
                else
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "powershell.exe",
                        WorkingDirectory = installersDir,
                        Arguments = "-NoProfile -ExecutionPolicy RemoteSigned -File \"" + launchPs + "\"",
                        UseShellExecute = true
                    });
                }

                args.Result = true;
            }
            catch (Exception ex)
            {
                args.Result = ex;
            }
            finally
            {
                if (args.Cancel && !string.IsNullOrWhiteSpace(dir))
                {
                    TryDelete(Path.Combine(dir, "glancerf.zip"));
                    TryDeleteDirectory(Path.Combine(dir, "_extract_tmp"));
                }
            }
        };

        _installWorker.ProgressChanged += (_, args) =>
        {
            if (args.UserState is InstallProgressReport r)
            {
                _statusLabel.Text = r.Message;
                _progress.Style = r.Style;
                if (r.Style == ProgressBarStyle.Continuous)
                {
                    _progress.MarqueeAnimationSpeed = 0;
                    var p = r.Percent;
                    if (p < _progress.Minimum) p = _progress.Minimum;
                    if (p > _progress.Maximum) p = _progress.Maximum;
                    _progress.Value = p;
                }
                else
                {
                    _progress.MarqueeAnimationSpeed = 30;
                }
            }
        };

        _installWorker.RunWorkerCompleted += (_, args) =>
        {
            _installing = false;
            SetWizardBusy(false);

            if (args.Cancelled)
            {
                _progress.Visible = false;
                ShowPage(1);
                UpdateWizardChrome();
                return;
            }

            if (args.Error != null)
            {
                _progress.Visible = false;
                MessageBox.Show(this, args.Error.Message, DialogCaption, MessageBoxButtons.OK, MessageBoxIcon.Error);
                ShowPage(1);
                UpdateWizardChrome();
                return;
            }

            if (args.Result is Exception ex)
            {
                _progress.Visible = false;
                MessageBox.Show(this, ex.Message, DialogCaption, MessageBoxButtons.OK, MessageBoxIcon.Error);
                ShowPage(1);
                UpdateWizardChrome();
                return;
            }

            Close();
        };

        _installWorker.RunWorkerAsync(installDir);
    }

    private void SetWizardBusy(bool busy)
    {
        _btnBack.Enabled = !busy && _pageIndex > 0;
        _btnNext.Enabled = !busy && CanGoNextFromCurrentPage() && _pageIndex < 2;
        _btnCancel.Enabled = true;

        _browseButton.Enabled = !busy;
        _installPath.Enabled = !busy;
    }

    private static void DownloadFileWithProgress(string url, string destPath, BackgroundWorker worker, DoWorkEventArgs e)
    {
        ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;

        var request = (HttpWebRequest)WebRequest.CreateHttp(url);
        request.UserAgent = HttpUserAgent;
        request.Method = "GET";
        request.AllowAutoRedirect = true;

        using var response = (HttpWebResponse)request.GetResponse();
        if (response.StatusCode != HttpStatusCode.OK)
        {
            throw new InvalidOperationException($"Download failed: HTTP {(int)response.StatusCode}");
        }

        var total = response.ContentLength;
        using var input = response.GetResponseStream() ?? throw new InvalidOperationException("Empty download stream.");
        using var output = new FileStream(destPath, FileMode.Create, FileAccess.Write, FileShare.None);

        // Avoid reporting on every read: WinForms ProgressBar repaints often and looks jittery when flooded.
        // For unknown Content-Length, use Marquee once instead of re-reporting every buffer.
        var buffer = new byte[65536];
        long readTotal = 0;
        var lastReportedPct = -1;
        int n;

        if (total <= 0)
        {
            worker.ReportProgress(0,
                new InstallProgressReport(0, DownloadProgressMessage, ProgressBarStyle.Marquee));
        }

        while ((n = input.Read(buffer, 0, buffer.Length)) > 0)
        {
            if (worker.CancellationPending)
            {
                e.Cancel = true;
                return;
            }

            output.Write(buffer, 0, n);
            readTotal += n;

            if (total > 0)
            {
                var pct = (int)Math.Min(readTotal * 100L / total, 100L);
                if (pct != lastReportedPct)
                {
                    lastReportedPct = pct;
                    worker.ReportProgress(pct, new InstallProgressReport(pct, DownloadProgressMessage,
                        ProgressBarStyle.Continuous));
                }
            }
        }
    }

    /// <summary>
    /// Locates the Python app root (folder that contains run.py + glancerf + installers).
    /// GitHub archives may place that at the repo root, under Project/, or deeper; only scanning
    /// immediate children misses valid layouts.
    /// </summary>
    private static DirectoryInfo FindProjectInner(string root)
    {
        var rootDir = new DirectoryInfo(root);
        if (!rootDir.Exists)
        {
            return null;
        }

        var queue = new Queue<DirectoryInfo>();
        queue.Enqueue(rootDir);
        var safety = 0;
        const int maxDirs = 12000;

        while (queue.Count > 0 && safety++ < maxDirs)
        {
            var current = queue.Dequeue();
            if (LooksLikeProject(current))
            {
                return current;
            }

            try
            {
                foreach (var sub in current.GetDirectories())
                {
                    queue.Enqueue(sub);
                }
            }
            catch
            {
                // ignore inaccessible directories (permissions, broken symlinks)
            }
        }

        return null;
    }

    private static bool LooksLikeProject(DirectoryInfo dir)
    {
        var runPy = Path.Combine(dir.FullName, "run.py");
        var glancerfDir = Path.Combine(dir.FullName, "glancerf");
        var installers = Path.Combine(dir.FullName, "installers");
        var installPs = Path.Combine(installers, "install-windows.ps1");
        var installExe = Path.Combine(installers, "GlanceRF-Install-Windows.exe");
        if (!File.Exists(runPy) || !Directory.Exists(glancerfDir) || !Directory.Exists(installers))
        {
            return false;
        }

        return File.Exists(installPs) || File.Exists(installExe);
    }

    private static void MoveProjectToRoot(DirectoryInfo innerProject, string installRoot)
    {
        // When the archive already expanded so the project root is the install folder,
        // every child already lives at destinationPath. Deleting then moving would remove
        // the real file and throw (for example on .dockerignore).
        if (SameNormalizedPath(innerProject.FullName, installRoot))
        {
            return;
        }

        foreach (var fileSystemInfo in innerProject.EnumerateFileSystemInfos())
        {
            var destinationPath = Path.Combine(installRoot, fileSystemInfo.Name);
            if (SameNormalizedPath(fileSystemInfo.FullName, destinationPath))
            {
                continue;
            }

            if (File.Exists(destinationPath))
            {
                File.Delete(destinationPath);
            }
            else if (Directory.Exists(destinationPath))
            {
                Directory.Delete(destinationPath, true);
            }

            if (fileSystemInfo is DirectoryInfo)
            {
                Directory.Move(fileSystemInfo.FullName, destinationPath);
            }
            else
            {
                File.Move(fileSystemInfo.FullName, destinationPath);
            }
        }

        var parent = innerProject.Parent;
        TryDeleteDirectory(innerProject.FullName);
        if (parent != null &&
            !string.Equals(parent.FullName.TrimEnd(Path.DirectorySeparatorChar),
                installRoot.TrimEnd(Path.DirectorySeparatorChar),
                StringComparison.OrdinalIgnoreCase))
        {
            TryDeleteDirectory(parent.FullName);
        }
    }

    private static bool SameNormalizedPath(string a, string b)
    {
        if (string.IsNullOrWhiteSpace(a) || string.IsNullOrWhiteSpace(b))
        {
            return false;
        }

        try
        {
            var na = Path.GetFullPath(a.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
            var nb = Path.GetFullPath(b.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
            return string.Equals(na, nb, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
            // non-fatal cleanup
        }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path) && !Directory.EnumerateFileSystemEntries(path).Any())
            {
                Directory.Delete(path, true);
            }
        }
        catch
        {
            // non-fatal cleanup
        }
    }

    private sealed class StandardWizardButton : Button
    {
        public StandardWizardButton()
        {
            FlatStyle = FlatStyle.System;
            UseVisualStyleBackColor = true;
            Font = new Font("Segoe UI", 9F);
            Height = 27;
            MinimumSize = new Size(92, 27);
            Margin = new Padding(6, 0, 0, 0);
        }
    }
}
