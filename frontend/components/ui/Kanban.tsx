const Kanban = () => {
  return (
    <div className="w-full flex flex-col md:flex-row ">
      {/* Kanban InProgress*/}
      <div className="bg-secondary/10 rounded-lg p-4 m-2 flex-1">
        <h2 className="text-lg font-semibold mb-4 text-foreground">
          In Progress
        </h2>
        {/* Cards for In Progress mails would go here */}
      </div>
      {/* Kanban Done*/}
      <div className="bg-secondary/10 rounded-lg p-4 m-2 flex-1">
        <h2 className="text-lg font-semibold mb-4 text-foreground">Done</h2>
        {/* Cards for Done mails would go here */}
      </div>
    </div>
  );
};

export default Kanban;
