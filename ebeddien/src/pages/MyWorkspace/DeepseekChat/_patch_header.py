from pathlib import Path

p = Path(__file__).with_name("index.jsx")
lines = p.read_text(encoding="utf-8").splitlines(keepends=True)
# Remove lines 798-1020 (1-based) -> index 797-1019 inclusive
new_lines = lines[:797] + lines[1020:]
insert = """  const setHeaderFromLayout = useChatAiHeaderSlot()

  useLayoutEffect(() => {
    if (!setHeaderFromLayout) return
    setHeaderFromLayout(
      <EbeddienChatHeaderMain
        assistantName={ASSISTANT_NAME}
        accountLoading={accountLoading}
        accountEmail={accountEmail}
        headerProfileInitial={headerProfileInitial}
        aiChatMode={aiChatMode}
        setAiChatMode={setAiChatMode}
        chatFontScale={chatFontScale}
        setChatFontScale={setChatFontScale}
        chatHeaderMenuOpen={chatHeaderMenuOpen}
        setChatHeaderMenuOpen={setChatHeaderMenuOpen}
        isSuperAdminTraining={isSuperAdminTraining}
        apiOfficialBusy={apiOfficialBusy}
        resetApiOfficialThread={resetApiOfficialThread}
        dsToken={dsToken}
        sessionBusy={sessionBusy}
        sending={sending}
        handleNewChat={handleNewChat}
        handleLogout={handleLogout}
      />
    )
    return () => setHeaderFromLayout(null)
  }, [
    setHeaderFromLayout,
    accountLoading,
    accountEmail,
    headerProfileInitial,
    aiChatMode,
    chatFontScale,
    chatHeaderMenuOpen,
    isSuperAdminTraining,
    apiOfficialBusy,
    dsToken,
    sessionBusy,
    sending,
    resetApiOfficialThread,
    handleNewChat,
    handleLogout
  ])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden" style={{ minHeight: 0 }}>
"""
# After cut line 797 (0-based) was '  /* Struktur...' - now new_lines[797] is '            {accountLoading ? ('
new_lines.insert(797, insert)
p.write_text("".join(new_lines), encoding="utf-8")
print("done")
