return (
  <div className="space-y-5">
    <div className="apple-toolbar">
      <div>
        <h2 className="text-xl font-semibold">Oktober 2026</h2>
        <p className="text-sm text-slate-400">Klik op een dag in de kalender om een afspraak te plannen</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="apple-segmented" role="tablist" aria-label="Agenda-view">
          <button type="button" className="apple-segment-btn is-active" aria-selected="true">Maand</button>
          <button type="button" className="apple-segment-btn" aria-selected="false">Lijst</button>
        </div>

        <button type="button" aria-label="Vorige maand" className="apple-btn apple-btn-icon">
          <ChevronLeft size={18} />
        </button>
        <button type="button" className="apple-btn" onClick={() => {
          const today = new Date();
          const month = new Date(today.getFullYear(), today.getMonth(), 1);
          setViewingMonth(month);
          setSelectedDate(localDate(today));
        }}>
          Vandaag
        </button>
        <button type="button" aria-label="Volgende maand" className="apple-btn apple-btn-icon">
          <ChevronRight size={18} />
        </button>
        <button type="button" className="apple-btn apple-btn-primary" onClick={() => openForm(null, selectedDate)}>
          + Nieuwe afspraak
        </button>
      </div>
    </div>

    <div className="apple-card p-3">
      <div className="apple-calendar-weekdays">
        {['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO'].map((day) => (
          <div key={day} className="apple-calendar-weekday">{day}</div>
        ))}
      </div>

      <div className="apple-calendar-grid">
        {calendarDays.map(({ date, iso, events }) => {
          const isCurrentMonth = date.getMonth() === viewingMonth.getMonth();
          const isSelected = iso === selectedDate;
          const summary = events.slice(0, 2);

          return (
            <div
              key={iso}
              role="gridcell"
              tabIndex={0}
              onClick={() => {
                setSelectedDate(iso);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                  e.preventDefault();
                  setSelectedDate(iso);
                  openForm(null, iso);
                }
              }}
              className={cx(
                'apple-calendar-cell',
                !isCurrentMonth && 'is-outside',
                isSelected && 'is-selected',
                new Date(iso).toDateString() === new Date().toDateString() && 'is-today',
              )}
            >
              <div className="apple-calendar-cell-header">
                <span className="apple-calendar-day-num">{date.getDate()}</span>
                <span className="apple-calendar-add-hint">+</span>
              </div>

              <div className="apple-calendar-events">
                {summary.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openForm(event, iso);
                    }}
                    className="apple-btn apple-btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '0 8px', minHeight: '32px', fontSize: '11px' }}
                  >
                    {event.title}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {notice && (
      <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
        {notice}
      </p>
    )}

    {(loadError || actionError) && (
      <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
        {actionError ?? loadError}
      </p>
    )}

    <Overlay open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Bewerk afspraak' : 'Nieuwe afspraak'}>
      <EventForm
        key={editing?.id ?? `new-${selectedDate}`}
        initial={editing}
        defaultDate={selectedDate}
        myHandle={me.handle}
        onSubmit={save}
        onCancel={() => setFormOpen(false)}
      />
    </Overlay>
  </div>
);
